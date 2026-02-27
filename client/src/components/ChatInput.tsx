/**
 * ChatInput — Barra de entrada do chat
 * Design: Obsidian Forge — input flutuante com backdrop blur, botões de ação
 * Funcionalidades: texto multilinha, upload imagem/PDF, gravação de áudio
 */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  X,
  Image as ImageIcon,
  FileText,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { transcribeAudio } from "@/lib/transcribe";
import {
  fileToDataUrl,
  isValidImage,
  isValidPdf,
  formatFileSize,
  formatDuration,
} from "@/lib/fileUtils";
import type { Attachment } from "@/lib/types";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  isLoading: boolean;
  initialMessage?: string;
}

export default function ChatInput({ onSend, isLoading, initialMessage }: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<
    (Attachment & { file?: File })[]
  >([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecording,
    duration,
    blob: audioBlob,
    error: audioError,
    startRecording,
    stopRecording,
    clearRecording,
  } = useAudioRecorder();

  // Preenche mensagem inicial (das sugestões)
  useEffect(() => {
    if (initialMessage) {
      setText(initialMessage);
      textareaRef.current?.focus();
    }
  }, [initialMessage]);

  // Auto-resize do textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [text]);

  // Mostra erro de áudio
  useEffect(() => {
    if (audioError) {
      toast.error(audioError);
    }
  }, [audioError]);

  // Quando o áudio é gravado, transcreve
  useEffect(() => {
    if (audioBlob) {
      handleAudioTranscription(audioBlob);
    }
  }, [audioBlob]);

  const handleAudioTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const transcription = await transcribeAudio(blob);
      if (transcription) {
        setText((prev) => (prev ? prev + " " + transcription : transcription));
      }
    } catch {
      toast.error("Erro ao transcrever áudio.");
    } finally {
      setIsTranscribing(false);
      clearRecording();
    }
  };

  const handleSend = useCallback(() => {
    if (isLoading || isRecording || isTranscribing) return;
    if (!text.trim() && attachments.length === 0) return;

    const cleanAttachments: Attachment[] = attachments.map(
      ({ file, ...rest }) => rest
    );

    onSend(text.trim(), cleanAttachments.length > 0 ? cleanAttachments : undefined);
    setText("");
    setAttachments([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachments, isLoading, isRecording, isTranscribing, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (isValidImage(file)) {
        try {
          const dataUrl = await fileToDataUrl(file);
          setAttachments((prev) => [
            ...prev,
            {
              type: "image",
              url: dataUrl,
              name: file.name,
              previewUrl: dataUrl,
              file,
            },
          ]);
        } catch {
          toast.error(`Erro ao processar ${file.name}`);
        }
      } else if (isValidPdf(file)) {
        try {
          const dataUrl = await fileToDataUrl(file);
          setAttachments((prev) => [
            ...prev,
            {
              type: "pdf",
              url: dataUrl,
              name: file.name,
              file,
            },
          ]);
        } catch {
          toast.error(`Erro ao processar ${file.name}`);
        }
      } else {
        toast.error(
          `Arquivo "${file.name}" não suportado. Use JPG, PNG ou PDF (máx. 10MB).`
        );
      }
    }

    // Limpa o input para permitir re-upload do mesmo arquivo
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = (text.trim() || attachments.length > 0) && !isLoading && !isRecording && !isTranscribing;

  return (
    <div className="sticky bottom-0 z-40 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-4 px-3 sm:px-4">
      {/* Preview de attachments */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 px-1">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="relative flex-shrink-0 rounded-lg border border-border bg-secondary/50 overflow-hidden group"
            >
              {att.type === "image" && att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="w-16 h-16 object-cover"
                />
              ) : (
                <div className="w-16 h-16 flex flex-col items-center justify-center gap-1 px-1">
                  <FileText className="w-5 h-5 text-red-400" />
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                    {att.name}
                  </span>
                </div>
              )}
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Indicador de gravação */}
      {isRecording && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20">
          <span className="recording-pulse w-3 h-3 rounded-full bg-destructive" />
          <span className="text-sm text-destructive font-medium">
            Gravando... {formatDuration(duration)}
          </span>
          <button
            onClick={stopRecording}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30 transition-colors"
          >
            <Square className="w-3 h-3" />
            Parar
          </button>
        </div>
      )}

      {/* Indicador de transcrição */}
      {isTranscribing && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <div className="flex gap-1">
            <span className="thinking-dot-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            <span className="thinking-dot-2 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            <span className="thinking-dot-3 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
          </div>
          <span className="text-sm text-primary font-medium">
            Transcrevendo áudio...
          </span>
        </div>
      )}

      {/* Input principal */}
      <div className="flex items-end gap-2 p-2 rounded-2xl bg-surface-elevated/80 border border-border backdrop-blur-sm shadow-lg shadow-black/20">
        {/* Botão de anexo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording || isLoading}
            >
              <Paperclip className="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Anexar imagem ou PDF</p>
          </TooltipContent>
        </Tooltip>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording
              ? "Gravando áudio..."
              : isTranscribing
              ? "Transcrevendo..."
              : "Digite sua mensagem..."
          }
          disabled={isRecording || isTranscribing}
          rows={1}
          className="flex-1 resize-none bg-transparent text-foreground text-[15px] placeholder:text-muted-foreground/60 focus:outline-none py-2.5 px-1 max-h-[150px] leading-relaxed disabled:opacity-50"
        />

        {/* Botão de áudio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 flex-shrink-0 transition-colors ${
                isRecording
                  ? "text-destructive hover:text-destructive"
                  : "text-muted-foreground hover:text-primary"
              }`}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading || isTranscribing}
            >
              {isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{isRecording ? "Parar gravação" : "Gravar áudio"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Botão enviar */}
        <Button
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          className={`h-10 w-10 flex-shrink-0 rounded-xl transition-all duration-200 ${
            canSend
              ? "bg-primary text-primary-foreground send-glow hover:bg-primary/90"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Dica de atalho */}
      <p className="text-[10px] text-muted-foreground/40 text-center mt-2 hidden sm:block">
        Enter para enviar · Shift+Enter para nova linha
      </p>
    </div>
  );
}
