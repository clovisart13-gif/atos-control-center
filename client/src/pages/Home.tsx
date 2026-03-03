/**
 * Home — Página principal do Atos Control Center
 * Design: Obsidian Forge — layout vertical full-screen com chat
 * Mobile-first, scroll automático, PWA-ready
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "@/hooks/useChat";
import ChatHeader from "@/components/ChatHeader";
import ChatMessageBubble from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import ThinkingIndicator from "@/components/ThinkingIndicator";
import WelcomeScreen from "@/components/WelcomeScreen";
import type { Attachment } from "@/lib/types";

export default function Home() {
  const { messages, isLoading, sendMessage, clearHistory, isLoadingHistory } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  const handleSend = useCallback(
    (message: string, attachments?: Attachment[]) => {
      sendMessage(message, attachments);
      setInitialMessage(undefined);
    },
    [sendMessage]
  );

  const handleSuggestionClick = useCallback((text: string) => {
    setInitialMessage(text);
  }, []);

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <ChatHeader
        onClearHistory={clearHistory}
        messageCount={messages.length}
      />

      {/* Área de mensagens */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Carregando histórico...</span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}

            {isLoading && <ThinkingIndicator />}

            {/* Âncora para scroll automático */}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="max-w-4xl mx-auto w-full">
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
