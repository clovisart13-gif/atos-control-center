/**
 * ChatHeader — Cabeçalho do Atos Control Center
 * Design: Obsidian Forge — barra compacta com logo, título e ações
 */
import { ASSETS, APP_CONFIG } from "@shared/const";
import { Trash2, Settings, Wifi, WifiOff, CheckCircle2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ChatHeaderProps {
  onClearHistory: () => void;
  messageCount: number;
}

export default function ChatHeader({ onClearHistory, messageCount }: ChatHeaderProps) {
  // Lê sempre do localStorage para mostrar o estado atual
  const [webhookUrl, setWebhookUrl] = useState(
    () => localStorage.getItem("atos-webhook-url") || import.meta.env.VITE_WEBHOOK_URL || ""
  );
  const [tempUrl, setTempUrl] = useState(webhookUrl);
  const [isOpen, setIsOpen] = useState(false);
  const isConnected = !!webhookUrl;

  // Quando o diálogo abre, sempre carrega a URL atual do localStorage
  useEffect(() => {
    if (isOpen) {
      const current = localStorage.getItem("atos-webhook-url") || import.meta.env.VITE_WEBHOOK_URL || "";
      setTempUrl(current);
    }
  }, [isOpen]);

  const handleSave = () => {
    const trimmed = tempUrl.trim();
    if (trimmed) {
      // Salva no localStorage imediatamente
      localStorage.setItem("atos-webhook-url", trimmed);
      setWebhookUrl(trimmed);
      toast.success("URL do webhook salva com sucesso!");
    } else {
      // Remove se vazio
      localStorage.removeItem("atos-webhook-url");
      setWebhookUrl("");
      toast.info("URL do webhook removida.");
    }
    setIsOpen(false);
  };

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
        {/* Indicador de conexão */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mr-1 ${
            isConnected
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden sm:inline">{isConnected ? "Conectado" : "Offline"}</span>
        </div>

        {/* Configurações (webhook URL) */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Settings className="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Configurações</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Configure a URL do webhook do n8n para conectar ao Mentor Cognitivo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <label className="text-sm font-medium text-foreground">
                Webhook URL
              </label>
              <input
                type="url"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/..."
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
              {/* Mostra a URL atualmente salva para referência */}
              {webhookUrl && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-emerald-400 font-medium mb-0.5">URL atual salva:</p>
                    <p className="text-[10px] text-muted-foreground break-all leading-relaxed">{webhookUrl}</p>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Cole a URL do webhook "WF Mentor Cognitivo API" do seu n8n. A URL é salva imediatamente — não é necessário recarregar a página.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setIsOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  Todas as {messageCount} mensagens serão removidas permanentemente do navegador.
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
