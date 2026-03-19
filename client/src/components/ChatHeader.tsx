/**
 * ChatHeader — Cabeçalho do Atos Control Center
 * Design: Obsidian Forge — barra compacta com logo, título e ações
 */
import { ASSETS, APP_CONFIG } from "@shared/const";
import { Trash2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

interface ChatHeaderProps {
  onClearHistory: () => void;
  messageCount: number;
}

export default function ChatHeader({ onClearHistory, messageCount }: ChatHeaderProps) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  // Heartbeat: verifica se o backend está online a cada 30 segundos
  const pingQuery = trpc.ping.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (pingQuery.isSuccess) {
      setIsOnline(true);
    } else if (pingQuery.isError) {
      setIsOnline(false);
    }
  }, [pingQuery.isSuccess, pingQuery.isError]);

  const statusLabel =
    isOnline === null ? "Verificando..." :
    isOnline ? "Online" : "Offline";

  const statusClass =
    isOnline === null ? "bg-muted/30 text-muted-foreground" :
    isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400";

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-xl">
      {/* Logo e título */}
      <div className="flex items-center gap-3">
        <img
          src={ASSETS.logo}
          alt="Atos"
          className="w-9 h-9 rounded-lg"
        />
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
            {APP_CONFIG.name}
          </h1>
          <span className="text-[11px] text-muted-foreground font-medium mt-0.5">
            Mentor Cognitivo
          </span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1">
        {/* Indicador de conexão — heartbeat real ao backend */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mr-1 transition-colors ${statusClass}`}
        >
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden sm:inline">{statusLabel}</span>
        </div>

        {/* Limpar histórico */}
        {messageCount > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Limpar histórico?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  Todas as {messageCount} mensagens serão removidas permanentemente.
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-secondary text-secondary-foreground border-border">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={onClearHistory}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Limpar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  );
}
