/**
 * WelcomeScreen — Tela de boas-vindas quando o chat está vazio
 * Design: Obsidian Forge — ilustração neural + sugestões de início
 */
import { ASSETS } from "@shared/const";
import { MessageSquare, Upload, Mic, FileText } from "lucide-react";

interface WelcomeScreenProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  {
    icon: MessageSquare,
    label: "Fazer uma pergunta",
    text: "Olá Atos, como você pode me ajudar?",
  },
  {
    icon: FileText,
    label: "Analisar documento",
    text: "Preciso que você analise um documento para mim.",
  },
  {
    icon: Upload,
    label: "Enviar imagem",
    text: "Vou enviar uma imagem para análise.",
  },
  {
    icon: Mic,
    label: "Gravar áudio",
    text: "Quero enviar uma mensagem de voz.",
  },
];

export default function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      {/* Ilustração */}
      <div className="w-28 h-28 sm:w-36 sm:h-36 mb-6 opacity-70">
        <img
          src={ASSETS.emptyState}
          alt="Atos Neural"
          className="w-full h-full object-contain rounded-2xl"
        />
      </div>

      {/* Texto de boas-vindas */}
      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 text-center">
        Olá, bem-vindo ao <span className="text-primary">Atos</span>
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-8 leading-relaxed">
        Seu mentor cognitivo está pronto. Envie uma mensagem, imagem, PDF ou grave um áudio para começar.
      </p>

      {/* Sugestões */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSuggestionClick(s.text)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/70 hover:border-primary/20 transition-all duration-200 group"
          >
            <s.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors font-medium text-center">
              {s.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
