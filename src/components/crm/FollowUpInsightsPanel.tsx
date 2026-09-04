import { useMemo, useState } from "react";
import { BarChart3, BookOpen, Gift, Globe, TrendingUp, UserCheck } from "lucide-react";
import { Lead, LeadStage } from "@/types/crm";

type Tab = "cadencia" | "metricas";
type SourceFilter = "todos" | "organico" | "promotora" | "indicacao";

type ReguaEntry = {
  stage: LeadStage;
  label: string;
  cadencia: string;
  tipo: string;
  desc: string;
  color: "green" | "teal" | "blue" | "amber" | "orange" | "rose" | "gray" | "purple";
};

const REGUA: ReguaEntry[] = [
  { stage: "Novo", label: "NOVO", cadencia: "Imediato", tipo: "1º contato", color: "green", desc: "Lead acabou de entrar — atendimento inicial e tentativa de agendamento." },
  { stage: "Em contato", label: "EC", cadencia: "+1 dia", tipo: "Nutrição", color: "teal", desc: "Já houve conversa, mas ainda não existe agendamento." },
  { stage: "Follow-Up 1", label: "D1", cadencia: "Mesmo dia", tipo: "Primeiro follow-up", color: "blue", desc: "Primeira retomada depois do contato inicial." },
  { stage: "Follow-Up 2", label: "D2", cadencia: "+1 dia", tipo: "Retomada", color: "blue", desc: "Reengajar sem pressão e buscar avanço na conversa." },
  { stage: "Follow-Up 3", label: "D3", cadencia: "+1 dia", tipo: "Retomada", color: "blue", desc: "Último bloco da cadência diária antes de espaçar." },
  { stage: "Follow-Up 4", label: "D4", cadencia: "+2 dias", tipo: "Reengajamento", color: "amber", desc: "Retomar depois de uma pausa maior." },
  { stage: "Follow-Up 5", label: "D5", cadencia: "+3 dias", tipo: "Reengajamento", color: "amber", desc: "Nova tentativa com abordagem diferente." },
  { stage: "Follow-Up 6", label: "D6", cadencia: "+3 dias", tipo: "Prova social", color: "orange", desc: "Trabalhar confiança e prova social." },
  { stage: "Follow-Up 7", label: "D7", cadencia: "+3 dias", tipo: "Prova social", color: "orange", desc: "Manter o relacionamento ativo sem excesso de contato." },
  { stage: "Follow-Up 8", label: "D8", cadencia: "+4 dias", tipo: "Reengajamento", color: "rose", desc: "Reposicionar a conversa e abrir nova oportunidade." },
  { stage: "Follow-Up 9", label: "D9", cadencia: "+4 dias", tipo: "Reengajamento", color: "rose", desc: "Tentativa de retomada com condição ou contexto atual." },
  { stage: "Follow-Up 10", label: "D10", cadencia: "+5 dias", tipo: "Reengajamento", color: "rose", desc: "Últimos contatos ativos da régua." },
  { stage: "Follow-Up 11", label: "D11", cadencia: "+5 dias", tipo: "Encerramento", color: "gray", desc: "Contato de encerramento mantendo o canal aberto." },
  { stage: "Follow-Up 12", label: "D12", cadencia: "+7 dias", tipo: "Encerramento", color: "gray", desc: "Última tentativa da régua antes de relacionamento latente." },
  { stage: "Avaliação agendada", label: "AGEND", cadencia: "Antes da consulta", tipo: "Confirmação", color: "purple", desc: "Sai do follow-up comercial e entra na esteira de confirmação/agendamento." },
];

const BADGE: Record<ReguaEntry["color"], string> = {
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
};

function isPromotora(lead: Lead) {
  return String(lead.fonteLead || "").toLowerCase().includes("promotora");
}

function isIndicacao(lead: Lead) {
  const source = String(lead.fonteLead || "").toLowerCase();
  return source.includes("indicacao") || source.includes("indicação");
}

export function FollowUpInsightsPanel({ leads, initialTab = "cadencia" }: { leads: Lead[]; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [source, setSource] = useState<SourceFilter>("todos");

  const active = useMemo(() => leads.filter((lead) => !(lead as any)._deleted), [leads]);
  const filtered = useMemo(() => {
    if (source === "promotora") return active.filter(isPromotora);
    if (source === "indicacao") return active.filter(isIndicacao);
    if (source === "organico") return active.filter((lead) => !isPromotora(lead) && !isIndicacao(lead));
    return active;
  }, [active, source]);

  const metrics = useMemo(() => REGUA.map((row) => {
    const stageNumber = Number(String(row.stage).replace("Follow-Up ", ""));
    const pool = Number.isFinite(stageNumber)
      ? filtered.filter((lead) => (lead.followUpCount || 0) >= stageNumber)
      : filtered;
    const total = pool.length;
    const scheduled = pool.filter((lead) => lead.etapaLead === "Avaliação agendada" || !!lead.dataAgendamentoCriado).length;
    const replied = pool.filter((lead) => lead.respostaLead === "RESPONDEU").length;
    const dropped = pool.filter((lead) => lead.etapaLead === "Desistência").length;
    const hadAppt = pool.filter((lead) => !!lead.dataAgendamentoCriado || !!lead.dataAgendamentoAlterado).length;
    const showed = pool.filter((lead) => lead.comparecimento === "COMPARECEU").length;
    const activeCount = filtered.filter((lead) => lead.etapaLead === row.stage).length;
    return {
      ...row,
      total,
      activeCount,
      scheduledRate: total ? Math.round((scheduled / total) * 100) : 0,
      replyRate: total ? Math.round((replied / total) * 100) : 0,
      dropRate: total ? Math.round((dropped / total) * 100) : 0,
      showRate: hadAppt ? Math.round((showed / hadAppt) * 100) : null,
      hadAppt,
      showed,
    };
  }), [filtered]);

  const inProgress = filtered.filter((lead) => !["Finalizado", "Desistência", "Fora da região"].includes(String(lead.etapaLead))).length;
  const totalHadAppt = metrics.reduce((sum, item) => sum + item.hadAppt, 0);
  const totalShowed = metrics.reduce((sum, item) => sum + item.showed, 0);
  const showRate = totalHadAppt ? Math.round((totalShowed / totalHadAppt) * 100) : null;
  const best = [...metrics].filter((item) => item.total > 3).sort((a, b) => b.scheduledRate - a.scheduledRate)[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
          <button onClick={() => setTab("cadencia")} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${tab === "cadencia" ? "bg-background shadow" : "text-muted-foreground"}`}>
            <BookOpen className="h-4 w-4" /> Cadência
          </button>
          <button onClick={() => setTab("metricas")} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${tab === "metricas" ? "bg-background shadow" : "text-muted-foreground"}`}>
            <BarChart3 className="h-4 w-4" /> Métricas
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {([
            ["todos", "Todos", Globe],
            ["organico", "Orgânicos", Globe],
            ["promotora", "Promotora", UserCheck],
            ["indicacao", "Indicação", Gift],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setSource(id)} className={`px-2 py-1 rounded-full border text-xs font-medium flex items-center gap-1 ${source === id ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "cadencia" ? (
        <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-1">
          {REGUA.map((row) => {
            const count = filtered.filter((lead) => lead.etapaLead === row.stage).length;
            return (
              <div key={row.stage} className="rounded-lg border bg-background p-3 flex items-start gap-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${BADGE[row.color]}`}>{row.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold">{row.tipo}</span>
                    <span className="text-muted-foreground">• {row.cadencia}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.desc}</p>
                </div>
                {count > 0 && <span className="text-xs font-bold rounded-full bg-muted px-2 py-0.5">{count}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-primary/10 p-3"><p className="text-[11px] text-muted-foreground">Em andamento</p><p className="text-2xl font-bold text-primary">{inProgress}</p></div>
            <div className="rounded-lg border bg-emerald-50 p-3"><p className="text-[11px] text-muted-foreground">Melhor etapa</p><p className="text-sm font-bold text-emerald-700">{best ? `${best.label} · ${best.scheduledRate}%` : "—"}</p></div>
            <div className="rounded-lg border bg-teal-50 p-3"><p className="text-[11px] text-muted-foreground">Comparecimento</p><p className="text-2xl font-bold text-teal-700">{showRate === null ? "—" : `${showRate}%`}</p></div>
            <div className="rounded-lg border bg-amber-50 p-3"><p className="text-[11px] text-muted-foreground">Leads na base</p><p className="text-2xl font-bold text-amber-700">{filtered.length}</p></div>
          </div>

          <div className="overflow-auto rounded-lg border max-h-[55vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="text-left p-2.5">Etapa</th>
                  <th className="text-center p-2.5">Ativos</th>
                  <th className="text-center p-2.5">Agend.</th>
                  <th className="text-center p-2.5">Resp.</th>
                  <th className="text-center p-2.5">Comparec.</th>
                  <th className="text-center p-2.5">Desist.</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((item) => (
                  <tr key={item.stage} className="border-t">
                    <td className="p-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full border font-bold ${BADGE[item.color]}`}>{item.label}</span></td>
                    <td className="p-2.5 text-center font-semibold">{item.activeCount}</td>
                    <td className="p-2.5 text-center font-semibold">{item.total ? `${item.scheduledRate}%` : "—"}</td>
                    <td className="p-2.5 text-center">{item.total ? `${item.replyRate}%` : "—"}</td>
                    <td className="p-2.5 text-center">{item.showRate === null ? "—" : <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" />{item.showRate}%</span>}</td>
                    <td className="p-2.5 text-center">{item.total ? `${item.dropRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
