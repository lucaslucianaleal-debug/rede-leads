import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { useWhatsAppAgent, WhatsAppQueueItem } from "@/hooks/useWhatsAppAgent";
import { Lead, LeadStage } from "@/types/crm";
import { formatFollowUpMessage, getFollowUpMessageForLead } from "@/data/followUpMessages";

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
  const [search, setSearch] = useState("");
  const [onlyNoReply, setOnlyNoReply] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [queuing, setQueuing] = useState(false);

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

  const selectFirst40 = () => {
    setSelected(candidates.slice(0, 40).map((item) => item.lead.id));
  };

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 40));
  };

  const enqueue = async () => {
    if (!currentClinic) {
      toast.error("Selecione uma clínica antes de criar a fila.");
      return;
    }
    if (!selectedItems.length) {
      toast.error("Selecione pelo menos um lead.");
      return;
    }

    const ok = window.confirm(
      `Colocar ${selectedItems.length} follow-up(s) na fila automática?\n\n` +
      "O agente local enviará uma mensagem por vez, com intervalo aleatório configurado no computador. " +
      "Respostas e pedidos para parar cancelam os próximos envios daquele lead."
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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="border-slate-700 bg-slate-900">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Rede Leads</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">WhatsApp • Follow-up automático</h1>
            <p className="text-sm text-slate-400">Fila leve para o agente local — sem servidor Firebase no computador.</p>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardContent className="pt-6 flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${status.connected ? "border-emerald-700 bg-emerald-950/40 text-emerald-300" : "border-slate-700 bg-slate-950 text-slate-400"}`}>
              {status.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              <span className="font-medium">{status.connected ? "Agente conectado" : status.online ? "Agente online, WhatsApp desconectado" : "Agente offline"}</span>
            </div>
            {status.lastSeenAt && <span className="text-xs text-slate-500">Último sinal: {new Date(status.lastSeenAt).toLocaleString("pt-BR")}</span>}
            <Button variant="outline" size="sm" onClick={refreshStatus} disabled={loadingStatus} className="border-slate-700 ml-auto">
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingStatus ? "animate-spin" : ""}`} />Atualizar status
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Preparar fila de hoje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, telefone ou serviço..."
                className="max-w-sm bg-slate-950 border-slate-700"
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={onlyNoReply} onChange={(e) => setOnlyNoReply(e.target.checked)} />
                Somente quem não respondeu
              </label>
              <Button variant="secondary" onClick={selectFirst40} disabled={!candidates.length}>Selecionar 40 mais urgentes</Button>
              <Button onClick={enqueue} disabled={queuing || selectedItems.length === 0}>
                {queuing ? "Criando fila..." : `Colocar ${selectedItems.length || ""} na fila`}
              </Button>
            </div>

            <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              O padrão do agente é 150–270 segundos entre mensagens. Isso evita rajadas, mas nenhum intervalo garante que o WhatsApp não aplique restrições. Use contatos com relação comercial legítima e respeite pedidos para parar.
            </div>

            <div className="text-sm text-slate-400">{candidates.length} lead(s) elegíveis • {selectedItems.length}/40 selecionados</div>

            <div className="border border-slate-800 rounded-lg overflow-hidden max-h-[58vh] overflow-y-auto">
              {candidates.slice(0, 120).map(({ lead, message }) => {
                const checked = selected.includes(lead.id);
                return (
                  <label key={lead.id} className={`flex gap-3 p-3 border-b border-slate-800 cursor-pointer ${checked ? "bg-emerald-950/20" : "hover:bg-slate-800/50"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(lead.id)} disabled={!checked && selected.length >= 40} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{lead.nome}</span>
                        <span className="text-xs text-slate-500">{lead.telefone}</span>
                        <span className="text-xs rounded bg-slate-800 px-2 py-0.5">{lead.etapaLead}</span>
                        {checked && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{lead.servicoProcurado || "Sem serviço"} • último follow-up: {lead.lastFollowUpDone || "—"}</div>
                      <div className="text-xs text-slate-500 mt-1 truncate">{message.replace(/\n/g, " ")}</div>
                    </div>
                  </label>
                );
              })}
              {!candidates.length && <div className="p-8 text-center text-slate-500">Nenhum lead elegível com os filtros atuais.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
