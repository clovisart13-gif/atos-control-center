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

        if (!response.ok) {
          throw new Error(`Webhook retornou erro ${response.status}: ${rawText}`);
        }

        // Log para debug
        console.log("[Webhook Proxy] Status:", response.status);
        console.log("[Webhook Proxy] Raw response:", rawText.substring(0, 500));

        // Tenta parsear como JSON
        if (rawText && rawText.trim()) {
          try {
            let data = JSON.parse(rawText);

            // Se o resultado for uma string, pode ser JSON duplo (JSON.stringify dentro do n8n)
            if (typeof data === "string") {
              try { data = JSON.parse(data); } catch { return { reply: data }; }
            }

            // Se for array, pega o primeiro elemento
            const obj = Array.isArray(data) ? data[0] : data;

            if (typeof obj === "string") return { reply: obj };

            if (typeof obj === "object" && obj !== null) {
              // PRIORIDADE: campo "reply" é sempre o texto da mensagem
              // Campos como "execute", "action", etc. são ignorados na exibição
              if (obj.reply !== undefined && obj.reply !== null) {
                return { reply: typeof obj.reply === "string" ? obj.reply : JSON.stringify(obj.reply) };
              }

              // Fallback: busca em outros campos de texto conhecidos
              const textFields = ["output", "text", "message", "response", "content", "result", "answer"];
              for (const field of textFields) {
                if (obj[field] !== undefined && obj[field] !== null) {
                  const val = obj[field];
                  // Se o valor for um array (ex: content[0].text do OpenAI)
                  if (Array.isArray(val) && val.length > 0) {
                    const first = val[0];
                    if (typeof first === "string") return { reply: first };
                    if (first?.text) return { reply: first.text };
                    if (first?.content) return { reply: first.content };
                  }
                  if (typeof val === "string") return { reply: val };
                }
              }

              // Nenhum campo de texto encontrado — retorna o JSON bruto para debug
              const rawJson = JSON.stringify(obj, null, 2);
              console.log("[Webhook Proxy] Estrutura desconhecida:", rawJson);
              return { reply: "\u26a0\ufe0f **Resposta recebida do n8n (formato n\u00e3o reconhecido):**\n\n" + rawJson };
            }

            return { reply: String(data) };
          } catch {
            // Não é JSON — retorna como texto puro
            return { reply: rawText.trim() };
          }
        }

        return { reply: "" };
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
