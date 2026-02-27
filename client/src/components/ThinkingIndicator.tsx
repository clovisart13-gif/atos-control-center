/**
 * ThinkingIndicator — Indicador de "pensando..." do Atos
 * Design: Obsidian Forge — 3 dots pulsando em dourado com barra lateral
 */
import { ASSETS } from "@shared/const";

export default function ThinkingIndicator() {
  return (
    <div className="animate-message-in flex gap-3 max-w-[92%] sm:max-w-[80%] mr-auto">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden mt-1">
        <img src={ASSETS.logo} alt="Atos" className="w-full h-full object-cover" />
      </div>

      {/* Bolha de pensamento */}
      <div className="gold-accent-bar pl-6 bg-secondary/60 border border-border rounded-2xl px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Pensando</span>
          <div className="flex gap-1">
            <span className="thinking-dot-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            <span className="thinking-dot-2 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            <span className="thinking-dot-3 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
          </div>
        </div>
      </div>
    </div>
  );
}
