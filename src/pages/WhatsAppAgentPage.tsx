import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, MessageCircle, QrCode, RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { useWhatsAppAgent, WhatsAppQueueItem } from "@/hooks/useWhatsAppAgent";
import { Lead, LeadStage } from "@/types/crm";
import { formatFollowUpMessage, getFollowUpMessageForLead } from "@/data/followUpMessages";
import { WhatsAppInbox } from "@/components/crm/WhatsAppInbox";
import { WhatsAppQRModal } from "@/components/crm/WhatsAppQRModal";

function todayBr() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

function parseBrDate(value?: string) {
  if (!value) return 0;
  const [dd, mm, yyyy] = value.split("/").map(Number);
  if (!dd || !mm || !yyyy) return 0;
  return new Date(yyyy, mm - 1, dd).getTime();
}

function nextStage(stage: LeadStage): LeadStage {
  const match = String(stage || "").match(/^Follow-Up\s+(\d+)$/i);
  if (!match) return "Follow-Up 1";
  const n = Math.min(Number(match[1]) + 1, 12);
  return `Follow-Up ${n}` as LeadStage;
}

function buildMessage(lead: Lead, clinicName: string) {
  const hasAppointment = !!(lead.dataAgendamentoCriado || lead.dataAgendamentoAlterado);
  const noShow = lead.comparecimento === "NÃO COMPARECEU";
  const horario = lead.dataAgendamento ? lead.dataAgendamento.split(" ")[1] || "" : "";
  const template = getFollowUpMessageForLead(
    lead.etapaLead,
    lead.followUpCount || 0,
    hasAppointment,
    noShow,
  );
  if (!template) return "";
  return formatFollowUpMessage(
    template,
    lead.nome,
    lead.servicoProcurado,
    clinicName,
    horario,
    "",
    "",
    "",
    "",
    lead.captador || "",
  );
}

export default function WhatsAppAgentPage() {
  const { clinicMeta, currentClinic } = useAuth();
  const { allLeads } = useLeads();
  const { status, loadingStatus, refreshStatus, queueMessages } = useWhatsAppAgent();
  const [view, setView] = useState<"inbox" | "followup">("inbox");
  const [showQr, setShowQr] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyNoReply, setOnlyNoReply] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [queuing, setQueuing] = useState(false);

  useEffect(() => {
    if (status.qrCode && !status.connected) setShowQr(true);
  }, [status.qrCode, status.connected]);

  const today = todayBr();
  const clinicName = clinicMeta?.name || "Odontocompany";

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (allLeads || [])
      .filter((lead) => !(lead as any)._deleted)
      .filter((lead) => !!String(lead.telefone || "").replace(/\D/g, ""))
      .filter((lead) => !["FINALIZADO", "FINALIZADA", "DESISTÊNCIA", "DESISTENCIA", "FORA DA REGIÃO", "FORA DA REGIAO"].includes(String(lead.etapaLead || "").toUpperCase()))
      .filter((lead) => lead.lastFollowUpDone !== today)
      .filter((lead) => !onlyNoReply || lead.respostaLead !== "RESPONDEU")
      .filter((lead) => !term || lead.nome.toLowerCase().includes(term) || lead.telefone.includes(term) || String(lead.servicoProcurado || "").toLowerCase().includes(term))
      .map((lead) => ({ lead, message: buildMessage(lead, clinicName) }))
      .filter((item) => !!item.message)
      .sort((a, b) => {
        const aDate = parseBrDate(a.lead.lastFollowUpDone || a.lead.dataFollowUp || a.lead.dataCriacao);
        const bDate = parseBrDate(b.lead.lastFollowUpDone || b.lead.dataFollowUp || b.lead.dataCriacao);
        return aDate - bDate;
      });
  }, [allLeads, search, onlyNoReply, today, clinicName]);

  const selectedItems = useMemo(() => {
    const ids = new Set(selected);
    return candidates.filter((item) => ids.has(item.lead.id));
  }, [candidates, selected]);

  const selectFirst40 = () => setSelected(candidates.slice(0, 40).map((item) => item.lead.id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 40));

  const enqueue = async () => {
    if (!currentClinic) return toast.error("Selecione uma clínica antes de criar a fila.");
    if (!selectedItems.length) return toast.error("Selecione pelo menos um lead.");
    if (!status.connected) return toast.error("Conecte o WhatsApp antes de iniciar os follow-ups.");

    const ok = window.confirm(
      `Colocar ${selectedItems.length} follow-up(s) na fila automática?\n\n` +
      "O agente enviará um follow-up por vez, com intervalo aleatório. Mensagens manuais da caixa de entrada têm prioridade."
    );
    if (!ok) return;

    const items: WhatsAppQueueItem[] = selectedItems.map(({ lead, message }) => ({
      leadId: lead.id,
      phone: lead.telefone,
      name: lead.nome,
      message,
      kind: "followup",
      stage: lead.etapaLead,
      nextStage: nextStage(lead.etapaLead),
    }));

    setQueuing(true);
    try {
      const result = await queueMessages(items);
      toast.success(`${result.queued} mensagem(ns) colocada(s) na fila${result.skipped ? `; ${result.skipped} já estavam programadas/enviadas hoje` : ""}.`);
      setSelected([]);
      refreshStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar fila");
    } finally {
      setQueuing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Rede Leads</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-bold">WhatsApp Comercial</h1>
            <p className="text-sm text-muted-foreground">Conversas e follow-ups usando o agente local deste computador.</p>
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
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                O WhatsApp Desktop já estar aberto não conecta o agente. Precisamos rodar o <strong>WhatsApp Agent</strong> no seu PC uma vez. Quando ele iniciar, o QR aparecerá nesta tela e você vai em <strong>WhatsApp no celular → Aparelhos conectados → Conectar aparelho</strong>.
              </div>
            )}
            {status.online && !status.connected && !status.qrCode && (
              <div className="text-sm text-muted-foreground">Agente está rodando. Aguardando geração do QR ou restauração da sessão anterior.</div>
            )}
            {status.lastError && <div className="text-xs text-destructive">Último erro: {status.lastError}</div>}
          </CardContent>
        </Card>

        <div className="flex gap-2 border-b pb-2">
          <Button variant={view === "inbox" ? "default" : "ghost"} onClick={() => setView("inbox")}>
            <MessageCircle className="h-4 w-4 mr-2" />Conversas
          </Button>
          <Button variant={view === "followup" ? "default" : "ghost"} onClick={() => setView("followup")}>
            <Send className="h-4 w-4 mr-2" />Follow-ups
          </Button>
        </div>

        {view === "inbox" ? (
          <WhatsAppInbox />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Preparar fila de hoje</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome, telefone ou serviço..." className="max-w-sm" />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={onlyNoReply} onChange={(e) => setOnlyNoReply(e.target.checked)} />
                  Somente quem não respondeu
                </label>
                <Button variant="secondary" onClick={selectFirst40} disabled={!candidates.length}>Selecionar 40 mais urgentes</Button>
                <Button onClick={enqueue} disabled={queuing || selectedItems.length === 0 || !status.connected}>
                  {queuing ? "Criando fila..." : `Colocar ${selectedItems.length || ""} na fila`}
                </Button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Follow-ups automáticos: 150–270 segundos entre envios. Respostas do lead cancelam a automação. Mensagens que você escrever em Conversas têm prioridade e não esperam essa janela.
              </div>

              <div className="text-sm text-muted-foreground">{candidates.length} lead(s) elegíveis • {selectedItems.length}/40 selecionados</div>

              <div className="border rounded-lg overflow-hidden max-h-[58vh] overflow-y-auto">
                {candidates.slice(0, 120).map(({ lead, message }) => {
                  const checked = selected.includes(lead.id);
                  return (
                    <label key={lead.id} className={`flex gap-3 p-3 border-b cursor-pointer ${checked ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(lead.id)} disabled={!checked && selected.length >= 40} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{lead.nome}</span>
                          <span className="text-xs text-muted-foreground">{lead.telefone}</span>
                          <span className="text-xs rounded bg-muted px-2 py-0.5">{lead.etapaLead}</span>
                          {checked && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{lead.servicoProcurado || "Sem serviço"} • último follow-up: {lead.lastFollowUpDone || "—"}</div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">{message.replace(/\n/g, " ")}</div>
                      </div>
                    </label>
                  );
                })}
                {!candidates.length && <div className="p-8 text-center text-muted-foreground">Nenhum lead elegível com os filtros atuais.</div>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {showQr && <WhatsAppQRModal qrCode={status.qrCode || null} onClose={() => setShowQr(false)} />}
    </div>
  );
}
