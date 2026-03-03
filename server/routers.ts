import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  /**
   * Proxy para o webhook n8n — contorna bloqueio CORS do navegador.
   * O frontend envia para /api/trpc/webhook.send, o backend faz o POST para o n8n.
   */
  webhook: router({
    send: publicProcedure
      .input(
        z.object({
          webhookUrl: z.string().url(),
          payload: z.object({
            user_id: z.string(),
            message: z.string(),
            attachments: z
              .array(
                z.object({
                  type: z.enum(["image", "pdf"]),
                  url: z.string(),
                })
              )
              .optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const { webhookUrl, payload } = input;

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        // Lê o corpo como texto para ser flexível
        const rawText = await response.text();

        // Log completo para diagnóstico
        console.log("[Webhook Proxy] Status:", response.status);
        console.log("[Webhook Proxy] Content-Type:", response.headers.get("content-type"));
        console.log("[Webhook Proxy] Raw response (primeiros 1000 chars):", rawText.substring(0, 1000));

        if (!response.ok) {
          // Retorna o erro como mensagem visível no chat para diagnóstico
          return { reply: "\u274c **Erro HTTP " + response.status + "**\n\nResposta bruta do n8n:\n" + rawText.substring(0, 500) };
        }

        // MODO DIAGNÓSTICO: mostra tudo que o n8n retorna
        if (!rawText || !rawText.trim()) {
          return { reply: "❌ **n8n retornou resposta vazia (sem conteúdo)**\n\nStatus HTTP: " + response.status };
        }

        // Tenta parsear como JSON
        try {
          let data = JSON.parse(rawText);

          // Se o resultado for uma string, pode ser JSON duplo
          if (typeof data === "string") {
            try { data = JSON.parse(data); } catch { return { reply: data }; }
          }

          // Se for array, pega o primeiro elemento
          const obj = Array.isArray(data) ? data[0] : data;

          if (typeof obj === "string") return { reply: obj };

          if (typeof obj === "object" && obj !== null) {
            // PRIORIDADE: campo "reply"
            if (obj.reply !== undefined && obj.reply !== null) {
              return { reply: typeof obj.reply === "string" ? obj.reply : JSON.stringify(obj.reply) };
            }

            // Fallback: busca em outros campos de texto conhecidos
            const textFields = ["output", "text", "message", "response", "content", "result", "answer"];
            for (const field of textFields) {
              if (obj[field] !== undefined && obj[field] !== null) {
                const val = obj[field];
                if (Array.isArray(val) && val.length > 0) {
                  const first = val[0];
                  if (typeof first === "string") return { reply: first };
                  if (first?.text) return { reply: first.text };
                  if (first?.content) return { reply: first.content };
                }
                if (typeof val === "string") return { reply: val };
              }
            }

            // Nenhum campo reconhecido — mostra JSON completo no chat
            const jsonStr = JSON.stringify(obj, null, 2);
            return { reply: "\u26a0\ufe0f **Resposta do n8n recebida, mas sem campo 'reply'.** Estrutura retornada:\n\n" + jsonStr };
          }

          return { reply: String(data) };
        } catch {
          // Não é JSON — retorna como texto puro
          return { reply: rawText.trim() };
        }
      }),
  }),

  /**
   * Transcrição de áudio com Whisper API via backend.
   * Fluxo: frontend envia blob base64 → backend faz upload para S3 → chama Whisper → retorna texto.
   */
  voice: router({
    transcribe: publicProcedure
      .input(
        z.object({
          // Áudio em base64 (sem prefixo data:...)
          audioBase64: z.string(),
          // Tipo MIME do áudio (ex: audio/webm)
          mimeType: z.string().default("audio/webm"),
        })
      )
      .mutation(async ({ input }) => {
        const { audioBase64, mimeType } = input;

        // 1. Decodifica base64 para Buffer
        let audioBuffer: Buffer;
        try {
          audioBuffer = Buffer.from(audioBase64, "base64");
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Dados de áudio inválidos.",
          });
        }

        // Verifica tamanho (máx 16MB)
        const sizeMB = audioBuffer.length / (1024 * 1024);
        if (sizeMB > 16) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Áudio muito grande (${sizeMB.toFixed(1)}MB). Máximo permitido: 16MB.`,
          });
        }

        // 2. Faz upload para S3 para obter URL pública
        const ext = mimeType.includes("webm") ? "webm"
          : mimeType.includes("mp4") ? "mp4"
          : mimeType.includes("ogg") ? "ogg"
          : mimeType.includes("wav") ? "wav"
          : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3"
          : "webm";

        const fileKey = `audio-transcriptions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        let audioUrl: string;
        try {
          const uploaded = await storagePut(fileKey, audioBuffer, mimeType);
          audioUrl = uploaded.url;
          console.log("[Voice] Áudio enviado para S3:", audioUrl);
        } catch (err) {
          console.error("[Voice] Erro no upload para S3:", err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao fazer upload do áudio. Tente novamente.",
          });
        }

        // 3. Transcreve com Whisper
        const result = await transcribeAudio({
          audioUrl,
          language: "pt",
          prompt: "Transcreva a fala do usuário em português brasileiro.",
        });

        // Verifica se houve erro
        if ("error" in result) {
          console.error("[Voice] Erro na transcrição:", result);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro na transcrição: ${result.error}`,
          });
        }

        console.log("[Voice] Transcrição concluída:", result.text.substring(0, 100));

        return {
          text: result.text,
          language: result.language,
          duration: result.duration,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
