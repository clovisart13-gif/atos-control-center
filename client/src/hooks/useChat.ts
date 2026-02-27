import { useState, useCallback, useRef, useEffect } from "react";
import { nanoid } from "nanoid";
import type { ChatMessage, Attachment, WebhookPayload } from "@/lib/types";
import { APP_CONFIG } from "@shared/const";

/**
 * Obtém a URL do webhook dinamicamente
 * Prioridade: localStorage > variável de ambiente > window global
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
 * Aceita:
 * - JSON com campo "reply": { "reply": "texto" }
 * - JSON com campo "output": { "output": "texto" }
 * - JSON com campo "text": { "text": "texto" }
 * - JSON com campo "message": { "message": "texto" }
 * - JSON com campo "response": { "response": "texto" }
 * - JSON array: [{ "output": "texto" }]
 * - Texto puro: "resposta direta"
 * - Qualquer outro JSON: converte para string
 */
async function extractReply(response: Response): Promise<string> {
  // Lê o corpo da resposta como texto primeiro
  const rawText = await response.text();

  // Se a resposta estiver vazia
  if (!rawText || rawText.trim() === "") {
    return "✅ Mensagem recebida pelo servidor (resposta vazia).";
  }

  // Tenta parsear como JSON
  try {
    const data = JSON.parse(rawText);

    // Se for um array, pega o primeiro item
    const obj = Array.isArray(data) ? data[0] : data;

    if (typeof obj === "string") {
      return obj;
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
          if (typeof value === "string") return value;
          if (typeof value === "object") return JSON.stringify(value, null, 2);
          return String(value);
        }
      }

      // Se nenhum campo conhecido, retorna o JSON formatado
      return JSON.stringify(obj, null, 2);
    }

    // Qualquer outro tipo
    return String(data);
  } catch {
    // Não é JSON — retorna como texto puro
    return rawText.trim();
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
    // Mantém no máximo 200 mensagens no localStorage
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

  // Salva histórico sempre que as mensagens mudam
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;

      setError(null);

      // Cria mensagem do usuário
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
        // Monta payload para o webhook
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

        // Cancela requisição anterior se existir
        if (abortRef.current) {
          abortRef.current.abort();
        }
        abortRef.current = new AbortController();

        // Obtém URL do webhook dinamicamente
        const webhookUrl = getWebhookUrl();

        if (!webhookUrl) {
          // Modo demo quando não há webhook configurado
          await new Promise((r) => setTimeout(r, 1500));
          const assistantMessage: ChatMessage = {
            id: nanoid(),
            role: "assistant",
            content:
              '⚠️ **Webhook não configurado.** Clique no ícone de ⚙️ **Configurações** no canto superior direito para inserir a URL do webhook do n8n.\n\nFormato esperado:\n```\nhttps://seu-n8n.com/webhook/seu-id\n```',
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
          throw new Error(`Erro do servidor: ${response.status} ${response.statusText}`);
        }

        // Extrai resposta de forma flexível (aceita JSON, texto, vazio)
        const replyText = await extractReply(response);

        const assistantMessage: ChatMessage = {
          id: nanoid(),
          role: "assistant",
          content: replyText,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err: any) {
        if (err.name === "AbortError") return;

        const errorMsg =
          err.message || "Erro ao comunicar com o servidor.";
        setError(errorMsg);

        const errorMessage: ChatMessage = {
          id: nanoid(),
          role: "assistant",
          content: `❌ **Erro de comunicação:** ${errorMsg}\n\nVerifique a conexão e a URL do webhook nas configurações.`,
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
