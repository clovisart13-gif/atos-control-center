import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

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

        // Tenta parsear como JSON
        if (rawText && rawText.trim()) {
          try {
            const data = JSON.parse(rawText);
            const obj = Array.isArray(data) ? data[0] : data;

            if (typeof obj === "string") return { reply: obj };

            if (typeof obj === "object" && obj !== null) {
              const fields = ["reply", "output", "text", "message", "response", "content", "result", "answer", "data"];
              for (const field of fields) {
                if (obj[field] !== undefined && obj[field] !== null) {
                  const val = obj[field];
                  return { reply: typeof val === "string" ? val : JSON.stringify(val, null, 2) };
                }
              }
              return { reply: JSON.stringify(obj, null, 2) };
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
});

export type AppRouter = typeof appRouter;
