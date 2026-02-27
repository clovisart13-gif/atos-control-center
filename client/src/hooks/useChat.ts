import { useState, useCallback, useRef, useEffect } from "react";
import { nanoid } from "nanoid";
import type { ChatMessage, Attachment, WebhookPayload } from "@/lib/types";
import { APP_CONFIG } from "@shared/const";

/**
 * Obtém a URL do webhook dinamicamente
 */
function getWebhookUrl(): string {
  const fromStorage = localStorage.getItem("atos-webhook-url");
  if (fromStorage) return fromStorage;

  const fromWindow =
    typeof window !== "undefined" && (window as any).__ATOS_WEBHOOK_URL__;
  if (fromWindow) return fromWindow;

  const fromEnv = import.meta.env.VITE_WEBHOOK_URL;
  if (fromEnv) return fromEnv;

  return "";
}

/**
 * Extrai a resposta do webhook de forma flexível.
 * Retorna tanto o texto extraído quanto o debug da resposta bruta.
 */
async function extractReply(response: Response): Promise<{ reply: string; debug: string }> {
  // Lê o corpo da resposta como texto primeiro
  const rawText = await response.text();

  // Info de debug
  const statusInfo = `Status: ${response.status} ${response.statusText}`;
  const contentType = response.headers.get("content-type") || "não informado";
  const debugInfo = `${statusInfo}\nContent-Type: ${contentType}\nCorpo bruto (${rawText.length} chars):\n\`\`\`\n${rawText || "(vazio)"}\n\`\`\``;

  // Se a resposta estiver vazia
  if (!rawText || rawText.trim() === "") {
    return {
      reply: "",
      debug: debugInfo,
    };
  }

  // Tenta parsear como JSON
  try {
    const data = JSON.parse(rawText);

    // Se for um array, pega o primeiro item
    const obj = Array.isArray(data) ? data[0] : data;

    if (typeof obj === "string") {
      return { reply: obj, debug: debugInfo };
    }

    if (typeof obj === "object" && obj !== null) {
      // Tenta os campos mais comuns em ordem de prioridade
      const possibleFields = [
        "reply",
        "output",
        "text",
        "message",
        "response",
        "content",
        "result",
        "answer",
        "data",
      ];

      for (const field of possibleFields) {
        if (obj[field] !== undefined && obj[field] !== null) {
          const value = obj[field];
          if (typeof value === "string") return { reply: value, debug: debugInfo };
          if (typeof value === "object") return { reply: JSON.stringify(value, null, 2), debug: debugInfo };
          return { reply: String(value), debug: debugInfo };
        }
      }

      // Se nenhum campo conhecido, retorna o JSON formatado
      return { reply: JSON.stringify(obj, null, 2), debug: debugInfo };
    }

    return { reply: String(data), debug: debugInfo };
  } catch {
    // Não é JSON — retorna como texto puro
    return { reply: rawText.trim(), debug: debugInfo };
  }
}

const STORAGE_KEY = APP_CONFIG.localStorageKey;

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignora erros de parsing
  }
  return [];
}

function saveHistory(messages: ChatMessage[]) {
  try {
    const toSave = messages.slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Ignora erros de storage cheio
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

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
        const payload: WebhookPayload = {
          user_id: APP_CONFIG.userId,
          message: content.trim(),
        };

        if (attachments && attachments.length > 0) {
          payload.attachments = attachments.map((a) => ({
            type: a.type,
            url: a.url,
          }));
        }

        if (abortRef.current) {
          abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        const webhookUrl = getWebhookUrl();

        if (!webhookUrl) {
          await new Promise((r) => setTimeout(r, 1500));
          const assistantMessage: ChatMessage = {
            id: nanoid(),
            role: "assistant",
            content:
              '⚠️ **Webhook não configurado.** Clique no ícone de ⚙️ **Configurações** no canto superior direito para inserir a URL do webhook do n8n.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setIsLoading(false);
          return;
        }

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          // Mesmo com erro, tenta ler o corpo
          const errorBody = await response.text().catch(() => "(não foi possível ler)");
          throw new Error(
            `Erro ${response.status} ${response.statusText}\nCorpo: ${errorBody}`
          );
        }

        // Extrai resposta de forma flexível
        const { reply, debug } = await extractReply(response);

        let finalContent: string;

        if (reply) {
          finalContent = reply;
        } else {
          // Resposta vazia — mostra debug para ajudar a diagnosticar
          finalContent = `⚠️ **O servidor respondeu, mas sem conteúdo de texto.**\n\n**Diagnóstico da resposta:**\n${debug}\n\n**Possíveis causas:**\n- O nó "Webhook" no n8n está com "Respond" em "Immediately" (responde antes do modelo processar)\n- O nó "Message a model" não está conectado à resposta do webhook\n\n**Solução:**\n1. No nó **Webhook**, mude "Respond" para **"Using Last Node"**\n2. Certifique-se que o último nó do fluxo é o **"Message a model"** ou um nó que contenha a resposta`;
        }

        const assistantMessage: ChatMessage = {
          id: nanoid(),
          role: "assistant",
          content: finalContent,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err: any) {
        if (err.name === "AbortError") return;

        const errorMsg = err.message || "Erro ao comunicar com o servidor.";
        setError(errorMsg);

        const errorMessage: ChatMessage = {
          id: nanoid(),
          role: "assistant",
          content: `❌ **Erro de comunicação:**\n\n${errorMsg}\n\nVerifique a conexão e a URL do webhook nas configurações.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    []
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
