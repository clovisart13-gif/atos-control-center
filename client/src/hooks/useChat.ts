import { useState, useCallback, useEffect } from "react";
import { nanoid } from "nanoid";
import type { ChatMessage, Attachment } from "@/lib/types";
import { APP_CONFIG } from "@shared/const";
import { trpc } from "@/lib/trpc";

const userId = APP_CONFIG.userId;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Controla se já populou o estado local com o histórico inicial
  const [historyPopulated, setHistoryPopulated] = useState(false);

  // Carrega histórico do banco local (MySQL) — recarrega sempre que o componente monta
  const historyQuery = trpc.chat.getHistory.useQuery(
    { userId },
    {
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

  // Quando o histórico chega, popula o estado local UMA VEZ por sessão
  useEffect(() => {
    if (historyQuery.data !== undefined && !historyPopulated) {
      setHistoryPopulated(true);
      if (historyQuery.data.length > 0) {
        const serverMessages: ChatMessage[] = historyQuery.data.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt).getTime(),
        }));
        setMessages(serverMessages);
      }
    }
  }, [historyQuery.data, historyPopulated]);

  // Mutations tRPC
  const mentorMutation = trpc.mentor.chat.useMutation();
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

      // Salva mensagem do usuário no banco local (MySQL) de forma assíncrona
      saveMessageMutation.mutateAsync({
        userId,
        role: "user",
        content: content.trim(),
      }).catch((err) => console.error("[Chat] Erro ao salvar mensagem do usuário:", err));

      try {
        // Chama o Mentor nativo do Manus (com contexto do Supabase)
        const result = await mentorMutation.mutateAsync({
          message: content.trim(),
          userId,
        });

        const finalContent = result.reply || "⚠️ O assistente não retornou resposta. Tente novamente.";

        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
          },
        ]);

        // Salva resposta do assistente no banco local (MySQL) de forma assíncrona
        saveMessageMutation.mutateAsync({
          userId,
          role: "assistant",
          content: finalContent,
        }).catch((err) => console.error("[Chat] Erro ao salvar resposta do assistente:", err));

      } catch (err: any) {
        const errorMsg = err.message || "Erro ao comunicar com o servidor.";
        setError(errorMsg);
        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: `❌ **Erro de comunicação:**\n\n${errorMsg}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [mentorMutation, saveMessageMutation]
  );

  const clearHistory = useCallback(async () => {
    setMessages([]);
    setHistoryPopulated(false);
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
