import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, KeyRound, MessageCircle, QrCode, RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { WhatsAppInbox } from "@/components/crm/WhatsAppInbox";
import { FollowUpOperationsPanel } from "@/components/crm/FollowUpOperationsPanel";
import { WhatsAppQRModal } from "@/components/crm/WhatsAppQRModal";

export default function WhatsAppAgentPage() {
  const { currentClinic } = useAuth();
  const { leads, allLeads } = useLeads();
  const { status, loadingStatus, refreshStatus, pairAgent } = useWhatsAppAgent();
  const [view, setView] = useState<"inbox" | "followup">("inbox");
  const [showQr, setShowQr] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [pairSecret, setPairSecret] = useState("");

  useEffect(() => {
    if (status.qrCode && !status.connected) setShowQr(true);
  }, [status.qrCode, status.connected]);

  const prepareThisPc = async () => {
    setPairing(true);
    try {
      const secret = await pairAgent();
      setPairSecret(secret);
      toast.success("Chave deste computador gerada. Ela aparece somente agora.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao preparar computador");
    } finally {
      setPairing(false);
    }
  };

  const copyAgentConfig = async () => {
    if (!pairSecret || !currentClinic) return;
    const text = [
      "REDE_LEADS_URL=https://rede-leads.vercel.app",
      `CLINIC_ID=${currentClinic}`,
      `WHATSAPP_AGENT_SECRET=${pairSecret}`,
      "MIN_DELAY_SECONDS=150",
      "MAX_DELAY_SECONDS=270",
      "IDLE_POLL_SECONDS=8",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Configuração copiada. Cole no arquivo whatsapp-agent/.env do seu PC.");
    } catch {
      toast.error("Não consegui copiar automaticamente. Selecione o bloco e copie manualmente.");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1500px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Rede Leads</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold">Caixa de Entrada & Follow-ups</h1>
            <p className="text-sm text-muted-foreground">A mesma conversa acompanha o lead na caixa de entrada e na rotina diária.</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${status.connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status.online ? "border-amber-200 bg-amber-50 text-amber-700" : "border-border bg-muted/40 text-muted-foreground"}`}>
                {status.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                <span className="font-medium">
                  {status.connected ? "WhatsApp conectado" : status.online ? "Agente ligado • aguardando WhatsApp" : "Agente local desligado"}
                </span>
              </div>
              {status.connectedPhone && <span className="text-sm text-muted-foreground">Número: +{status.connectedPhone}</span>}
              {status.qrCode && !status.connected && (
                <Button variant="outline" size="sm" onClick={() => setShowQr(true)}>
                  <QrCode className="h-4 w-4 mr-2" />Abrir QR Code
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={refreshStatus} disabled={loadingStatus} className="ml-auto">
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingStatus ? "animate-spin" : ""}`} />Atualizar
              </Button>
            </div>

            {!status.online && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900 space-y-2">
                <div className="font-medium flex items-center gap-2"><KeyRound className="h-4 w-4" />Primeira conexão deste computador</div>
                <p>O agente entra como mais um aparelho vinculado. Depois da primeira leitura, a sessão fica salva neste PC.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={prepareThisPc} disabled={pairing}>
                    <KeyRound className="h-4 w-4 mr-2" />{pairing ? "Gerando..." : status.paired ? "Gerar nova chave deste PC" : "Preparar este computador"}
                  </Button>
                  {pairSecret && (
                    <Button size="sm" variant="outline" onClick={copyAgentConfig}>
                      <Copy className="h-4 w-4 mr-2" />Copiar configuração
                    </Button>
                  )}
                </div>
                {pairSecret && currentClinic && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs">Cole esta configuração no arquivo <strong>whatsapp-agent/.env</strong> do PC. A chave é exibida apenas nesta sessão.</p>
                    <pre className="overflow-x-auto rounded-md bg-slate-950 text-slate-100 p-3 text-xs whitespace-pre-wrap break-all">{`REDE_LEADS_URL=https://rede-leads.vercel.app\nCLINIC_ID=${currentClinic}\nWHATSAPP_AGENT_SECRET=${pairSecret}\nMIN_DELAY_SECONDS=150\nMAX_DELAY_SECONDS=270\nIDLE_POLL_SECONDS=8`}</pre>
                    <p className="text-xs">Depois, dentro de <strong>whatsapp-agent</strong>, execute <strong>npm start</strong>.</p>
                  </div>
                )}
              </div>
            )}
            {status.lastError && <div className="text-xs text-destructive">Último erro: {status.lastError}</div>}
          </CardContent>
        </Card>

        <div className="flex gap-2 border-b pb-2">
          <Button variant={view === "inbox" ? "default" : "ghost"} onClick={() => setView("inbox")}>
            <MessageCircle className="h-4 w-4 mr-2" />Caixa de Entrada
          </Button>
          <Button variant={view === "followup" ? "default" : "ghost"} onClick={() => setView("followup")}>
            <Send className="h-4 w-4 mr-2" />Rotina de Follow-up
          </Button>
        </div>

        {view === "inbox" ? (
          <WhatsAppInbox leads={allLeads || leads} />
        ) : (
          <FollowUpOperationsPanel leads={leads} allLeads={allLeads} />
        )}
      </div>

      <WhatsAppQRModal open={showQr} onClose={() => setShowQr(false)} qrCode={status.qrCode || ""} />
    </div>
  );
}
