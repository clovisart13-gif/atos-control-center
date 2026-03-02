import { useState, useCallback, useEffect } from "react";
import { nanoid } from "nanoid";
import type { ChatMessage, Attachment } from "@/lib/types";
import { APP_CONFIG } from "@shared/const";
import { trpc } from "@/lib/trpc";

/**
 * Obtém a URL do webhook SEMPRE do localStorage no momento da chamada.
 * Nunca usa cache em memória — garante que a URL mais recente seja usada.
 */
function getWebhookUrl(): string {
  // Lê diretamente do localStorage a cada chamada (sem cache)
  const fromStorage = localStorage.getItem("atos-webhook-url");
  if (fromStorage && fromStorage.trim()) return fromStorage.trim();

  const fromEnv = import.meta.env.VITE_WEBHOOK_URL;
  if (fromEnv) return fromEnv;

  return "";
}

const STORAGE_KEY = APP_CONFIG.localStorageKey;

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignora erros de parsing
  }
  return [];
}

function saveHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-200)));
  } catch {
    // Ignora erros de storage cheio
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Salva histórico sempre que as mensagens mudam
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Mutation tRPC para o proxy do webhook
  const webhookMutation = trpc.webhook.send.useMutation();

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

      try {
        // Lê a URL AGORA, no momento do envio — nunca usa cache em memória
        const webhookUrl = getWebhookUrl();

        if (!webhookUrl) {
          await new Promise((r) => setTimeout(r, 1500));
          setMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              content:
                '⚠️ **Webhook não configurado.** Clique no ícone de ⚙️ **Configurações** no canto superior direito para inserir a URL do webhook do n8n.',
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(false);
          return;
        }

        // Envia via proxy backend (contorna CORS)
        const result = await webhookMutation.mutateAsync({
          webhookUrl,
          payload: {
            user_id: APP_CONFIG.userId,
            message: content.trim(),
            attachments: attachments?.map((a) => ({ type: a.type, url: a.url })),
          },
        });

        const reply = result.reply;

        let finalContent: string;

        if (reply) {
          finalContent = reply;
        } else {
          finalContent =
            "⚠️ **O servidor respondeu, mas sem conteúdo de texto.**\n\n**Possível causa:** O nó \"Webhook\" no n8n está com \"Respond\" em \"Immediately\" (responde antes do modelo processar).\n\n**Solução:** No nó **Webhook**, mude \"Respond\" para **\"When Last Node Finishes\"**.";
        }

        setMessages((prev) => [
          ...prev,
          {
            id: nanoid(),
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
          },
        ]);
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
    [webhookMutation]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
  };
}
