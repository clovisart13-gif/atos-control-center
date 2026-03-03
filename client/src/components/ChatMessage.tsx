/**
 * ChatMessage — Bolha de mensagem individual
 * Design: Obsidian Forge
 * - Mensagens do usuário: à direita, fundo dourado sutil
 * - Mensagens do Atos: à esquerda, barra dourada lateral
 */
import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@/lib/types";
import { ASSETS } from "@shared/const";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Image as ImageIcon, Mic, Copy, Check } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatMessageBubble({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`animate-message-in flex gap-3 max-w-[92%] sm:max-w-[80%] lg:max-w-[70%] ${
        isUser ? "ml-auto flex-row-reverse" : "mr-auto"
      }`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden mt-1">
          <img src={ASSETS.logo} alt="Atos" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Conteúdo da mensagem */}
      <div className="flex flex-col gap-1">
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${isUser ? "justify-end" : ""}`}>
            {message.attachments.map((att, i) => (
              <div
                key={i}
                className="rounded-lg overflow-hidden border border-border bg-secondary/50"
              >
                {att.type === "image" && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="max-w-[200px] max-h-[200px] object-cover"
                  />
                ) : att.type === "image" ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {att.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <FileText className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {att.name}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bolha de texto */}
        {message.content && (
          <div
            className={`relative group rounded-2xl px-4 py-3 ${
              isUser
                ? "bg-primary/15 border border-primary/20 text-foreground"
                : "gold-accent-bar pl-6 bg-secondary/60 border border-border text-foreground"
            }`}
          >
            {message.isTranscription && (
              <div className="flex items-center gap-1.5 mb-2 text-[11px] text-primary font-medium">
                <Mic className="w-3 h-3" />
                <span>Transcrição de áudio</span>
              </div>
            )}

            <div className="text-[15px] leading-relaxed prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_code]:bg-background/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_code]:font-mono [&_pre]:bg-background/50 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-[13px] [&_strong]:text-primary [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>

            {/* Botão copiar — aparece sempre em mobile, hover em desktop */}
            <button
              onClick={handleCopy}
              className={`absolute top-2 right-2 p-1.5 rounded-md transition-all
                bg-background/60 border border-border/50 text-muted-foreground
                opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                hover:text-foreground hover:bg-background/80 active:scale-95`}
              title="Copiar mensagem"
              aria-label="Copiar mensagem"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Timestamp */}
        <span
          className={`text-[10px] text-muted-foreground/60 px-1 ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
