import { useState, useCallback, useEffect } from "react";
import { nanoid } from "nanoid";
import type { ChatMessage, Attachment } from "@/lib/types";
import { APP_CONFIG } from "@shared/const";
import { trpc } from "@/lib/trpc";

/**
 * Obtém a URL do webhook SEMPRE do localStorage no momento da chamada.
 */
function getWebhookUrl(): string {
  const fromStorage = localStorage.getItem("atos-webhook-url");
  if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  const fromEnv = import.meta.env.VITE_WEBHOOK_URL;
  if (fromEnv) return fromEnv;
  return "";
}

const userId = APP_CONFIG.userId;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega histórico do servidor
  const historyQuery = trpc.chat.getHistory.useQuery(
    { userId },
    { staleTime: 30_000 }
  );

  // Quando o histórico do servidor chega, popula o estado local
  useEffect(() => {
    if (historyQuery.data && historyQuery.data.length > 0) {
      const serverMessages: ChatMessage[] = historyQuery.data.map((m) => ({
        id: String(m.id),
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.createdAt).getTime(),
      }));
      setMessages(serverMessages);
    }
  }, [historyQuery.data]);

  // Mutations tRPC
  const webhookMutation = trpc.webhook.send.useMutation();
  const saveMessageMutation = trpc.chat.saveMessage.useMutation();
  const clearHistoryMutation = trpc.chat.clearHistory.useMutation();
  const utils = trpc.useUtils();

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;

      setError(null);

      const userMessage: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: content.trim(),
        attachments,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Salva mensagem do usuário no servidor (sem bloquear)
      saveMessageMutation.mutate({
        userId,
        role: "user",
        content: content.trim(),
      });

      try {
        const webhookUrl = getWebhookUrl();

        if (!webhookUrl) {
          await new Promise((r) => setTimeout(r, 1500));
          const noWebhookMsg = '⚠️ **Webhook não configurado.** Clique no ícone de ⚙️ **Configurações** no canto superior direito para inserir a URL do webhook do n8n.';
          setMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              content: noWebhookMsg,
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(false);
          return;
        }

        const result = await webhookMutation.mutateAsync({
          webhookUrl,
          payload: {
            user_id: userId,
            message: content.trim(),
            attachments: attachments?.map((a) => ({ type: a.type, url: a.url })),
          },
        });

        const reply = result.reply;
        const finalContent = reply || "⚠️ O assistente não retornou resposta. Tente novamente.";

        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
          },
        ]);

        // Salva resposta do assistente no servidor
        saveMessageMutation.mutate({
          userId,
          role: "assistant",
          content: finalContent,
        });

      } catch (err: any) {
        const errorMsg = err.message || "Erro ao comunicar com o servidor.";
        setError(errorMsg);
        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: `❌ **Erro de comunicação:**\n\n${errorMsg}\n\nVerifique a URL do webhook nas configurações.`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [webhookMutation, saveMessageMutation]
  );

  const clearHistory = useCallback(async () => {
    setMessages([]);
    await clearHistoryMutation.mutateAsync({ userId });
    utils.chat.getHistory.invalidate({ userId });
  }, [clearHistoryMutation, utils]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
    isLoadingHistory: historyQuery.isLoading,
  };
}
