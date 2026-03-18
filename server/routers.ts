import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { chatMessages } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

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
   * Histórico de mensagens do chat — sincronizado entre dispositivos via banco de dados.
   */
  chat: router({
    getHistory: publicProcedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        // Busca as 500 mensagens MAIS RECENTES e depois inverte para ordem cronológica
        const messages = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.userId, input.userId))
          .orderBy(desc(chatMessages.createdAt))
          .limit(500);
        // Inverte para exibição cronológica (mais antiga primeiro)
        return messages.reverse();
      }),

    saveMessage: publicProcedure
      .input(
        z.object({
          userId: z.string(),
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.insert(chatMessages).values({
          userId: input.userId,
          role: input.role,
          content: input.content,
        });
        return { success: true };
      }),

    clearHistory: publicProcedure
      .input(z.object({ userId: z.string() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(chatMessages).where(eq(chatMessages.userId, input.userId));
        return { success: true };
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
          return { reply: "Erro ao conectar com o assistente. Tente novamente." };
        }

        if (!rawText || !rawText.trim()) {
          return { reply: "O assistente não retornou resposta. Tente novamente." };
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
   */
  voice: router({
    transcribe: publicProcedure
      .input(
        z.object({
          audioBase64: z.string(),
          mimeType: z.string().default("audio/webm"),
        })
      )
      .mutation(async ({ input }) => {
        const { audioBase64, mimeType } = input;

        let audioBuffer: Buffer;
        try {
          audioBuffer = Buffer.from(audioBase64, "base64");
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Dados de áudio inválidos.",
          });
        }

        const sizeMB = audioBuffer.length / (1024 * 1024);
        if (sizeMB > 16) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Áudio muito grande (${sizeMB.toFixed(1)}MB). Máximo permitido: 16MB.`,
          });
        }

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
        } catch (err) {
          console.error("[Voice] Erro no upload para S3:", err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao fazer upload do áudio. Tente novamente.",
          });
        }

        const result = await transcribeAudio({
          audioUrl,
          language: "pt",
          prompt: "Transcreva a fala do usuário em português brasileiro.",
        });

        if ("error" in result) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro na transcrição: ${result.error}`,
          });
        }

        return {
          text: result.text,
          language: result.language,
          duration: result.duration,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
