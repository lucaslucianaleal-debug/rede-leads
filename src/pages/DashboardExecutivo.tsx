import React from "react";
import CommandCenter from "@/components/crm/CommandCenter";

export default function DashboardExecutivo() {
  return <CommandCenter />;
}

// ──────────────────────────────────────────────
// LEGACY — preserved below for reference only
// ──────────────────────────────────────────────
function _LegacyDashboard() {
  const { leads, lastSyncedAt, dataSource, ticketAverage, updateLead } = (null as any);
  const [periodPreset, setPeriodPreset] = React.useState<string>("last_7");

  // Helpers para métricas no período selecionado
  const parseDMY = (s?: string) => {
    if (!s) return null;
    const parts = s.split('/');
    if (parts.length < 3) return null;
    const d = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const y = Number(parts[2].split(' ')[0]);
    return new Date(y, m, d);
  };

  const getPeriodRange = (preset: string) => {
    const end = new Date();
    let start = new Date();
    switch (preset) {
      case 'last_7':
        start.setDate(end.getDate() - 6);
        break;
      case 'last_30':
        start.setDate(end.getDate() - 29);
        break;
      case 'month_current':
        start = new Date(end.getFullYear(), end.getMonth(), 1);
        break;
      case 'month_prev':
        const prev = new Date(end.getFullYear(), end.getMonth() - 1, 1);
        start = new Date(prev.getFullYear(), prev.getMonth(), 1);
        end.setFullYear(prev.getFullYear(), prev.getMonth());
        end.setDate(new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate());
        break;
      default:
        start.setDate(end.getDate() - 6);
    }
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    return { start, end };
  };

  const { start: periodStart, end: periodEnd } = getPeriodRange(periodPreset);

  const inRange = (d?: string) => {
    const date = parseDMY(d);
    if (!date) return false;
    return date >= periodStart && date <= periodEnd;
  };

  const totalLeads = leads.filter((l) => inRange(l.dataCriacao)).length;
  const agendados = leads.filter((l) => inRange(l.dataAgendamento)).length;
  const compareceram = leads.filter((l) => inRange(l.dataAgendamento) && l.comparecimento === "COMPARECEU").length;
  const followupsPend = leads.filter((l) => inRange(l.dataFollowUp) && l.comparecimento !== "COMPARECEU").length;
  const receitaPrevista = agendados * (ticketAverage || 0);

  // Sparkline: leads criados últimos 7 dias
  const sparkLast7 = (() => {
    const arr = Array.from({ length: 7 }).map(() => 0);
    const now = new Date();
    leads.forEach((l) => {
      const parts = (l.dataCriacao || "").split("/");
      if (parts.length === 3) {
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 7) arr[6 - diff]++;
      }
    });
    return arr;
  })();

  const periodLabel = (() => {
    switch (periodPreset) {
      case 'last_7': return 'Últimos 7 dias';
      case 'last_30': return 'Últimos 30 dias';
      case 'month_current': return 'Mês atual';
      case 'month_prev': return 'Mês anterior';
      default: return 'Período selecionado';
    }
  })();

  // --- Period previous range helper + delta calc ---
  const getPreviousRange = (start: Date, end: Date) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - (days - 1) * msPerDay);
    prevStart.setHours(0,0,0,0);
    prevEnd.setHours(23,59,59,999);
    return { start: prevStart, end: prevEnd };
  };

  const inRangePrev = (d?: string, prevRange?: { start: Date; end: Date }) => {
    if (!d || !prevRange) return false;
    const date = parseDMY(d);
    if (!date) return false;
    return date >= prevRange.start && date <= prevRange.end;
  };

  const computeDelta = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return { delta: '0%', dir: 'neutral' as const };
    if (previous === 0) return { delta: '+∞', dir: 'up' as const };
    const pct = Math.round(((current - previous) / previous) * 100);
    const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral';
    const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
    return { delta: sign, dir };
  };

  const prevRange = getPreviousRange(periodStart, periodEnd);
  const totalLeadsPrev = leads.filter((l) => inRangePrev(l.dataCriacao, prevRange)).length;
  const agendadosPrev = leads.filter((l) => inRangePrev(l.dataAgendamento, prevRange)).length;
  const compareceramPrev = leads.filter((l) => inRangePrev(l.dataAgendamento, prevRange) && l.comparecimento === "COMPARECEU").length;
  const followupsPendPrev = leads.filter((l) => inRangePrev(l.dataFollowUp, prevRange) && l.comparecimento !== "COMPARECEU").length;
  const receitaPrevistaPrev = agendadosPrev * (ticketAverage || 0);

  const deltaTotal = computeDelta(totalLeads, totalLeadsPrev);
  const deltaAgend = computeDelta(agendados, agendadosPrev);
  const deltaComp = computeDelta(compareceram, compareceramPrev);
  const deltaFollow = computeDelta(followupsPend, followupsPendPrev);
  const deltaReceita = computeDelta(receitaPrevista, receitaPrevistaPrev);

  // --- Prioritize modal state ---
  const [showPrioritize, setShowPrioritize] = React.useState(false);
  const [prioritized, setPrioritized] = React.useState<typeof leads>([] as typeof leads);

  // Helper: days since creation
  const daysSinceCreation = (d?: string) => {
    if (!d) return 9999;
    const parts = d.split('/');
    if (parts.length < 3) return 9999;
    const dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    const diff = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Generate prioritized leads D1-D3: created within last 3 days and without agendamento OR follow-up pending
  const computePrioritizedLeads = () => {
    const list = (leads || []).filter(l => {
      const d = daysSinceCreation(l.dataCriacao);
      const isD1toD3 = d >= 0 && d <= 3;
      const needsAction = (!l.dataAgendamento || l.dataAgendamento.trim() === "") || (l.comparecimento !== 'COMPARECEU' && l.dataFollowUp);
      return isD1toD3 && needsAction;
    }).slice(0, 100);
    return list;
  };

  const openPrioritize = () => {
    const list = computePrioritizedLeads();
    setPrioritized(list);
    setShowPrioritize(true);
  };

  // Auto-assign round-robin using a small captadores list derived from existing leads or fallback
  const getCaptadoresPool = () => {
    const pool = Array.from(new Set((leads || []).map(l => l.captador).filter(Boolean)));
    if (pool.length === 0) return ['Operador A', 'Operador B', 'Operador C'];
    return pool;
  };

  const autoAssignLeads = async (items: typeof leads) => {
    const pool = getCaptadoresPool();
    const idxKey = 'hero_assign_index_v1';
    let idx = Number(localStorage.getItem(idxKey) || '0');
    for (const l of items) {
      const assignee = pool[idx % pool.length];
      try {
        await updateLead?.(l.id, { captador: assignee });
      } catch (e) {}
      idx++;
    }
    localStorage.setItem(idxKey, String(idx));
    // refresh prioritized list
    setPrioritized(items.map(i => ({ ...i, captador: pool[(idx - items.length) % pool.length] })));
  };

  // Count recent attempts by parsing observacao timestamps like [dd/MM/yyyy HH:mm]
  const countRecentAttempts = (l: any, hours = 3) => {
    if (!l.observacao) return 0;
    const matches = Array.from(String(l.observacao).matchAll(/\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\]/g));
    let count = 0;
    const now = Date.now();
    matches.forEach(m => {
      try {
        const dt = m[1];
        const parts = dt.split(' ');
        const dateParts = parts[0].split('/');
        const timeParts = parts[1].split(':');
        const d = Number(dateParts[0]);
        const mo = Number(dateParts[1]) - 1;
        const y = Number(dateParts[2]);
        const hh = Number(timeParts[0]);
        const mm = Number(timeParts[1]);
        const ts = new Date(y, mo, d, hh, mm).getTime();
        if ((now - ts) <= hours * 60 * 60 * 1000) count++;
      } catch (e) {}
    });
    // fallback: use followUpCount as proxy
    if (count === 0) return l.followUpCount || 0;
    return count;
  };


  // --- Action-Command Engine (placed after parseDMY so parseDMY is available) ---
  const getWALink = (telefone: string) => {
    const num = telefone ? telefone.replace(/\D/g, "") : "";
    return num.length >= 10 ? `https://wa.me/${num}` : undefined;
  };

  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  const isHojeOuAmanha = (d?: string) => {
    const date = parseDMY(d);
    if (!date) return false;
    return (
      date >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) &&
      date <= new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 23, 59, 59, 999)
    );
  };

  const urgenteLeads = (leads || []).filter(
    (l) =>
      isHojeOuAmanha(l.dataAgendamento) &&
      ["FRIO", "NÃO RESPONDEU"].includes((l.status || "").toUpperCase()) &&
      l.comparecimento !== "COMPARECEU"
  );

  const prioritarioLeads = (leads || []).filter((l) => !l.captador || l.captador.trim() === "");

  const rotinaLeads = (leads || []).filter(
    (l) =>
      !l.dataAgendamento &&
      l.etapaLead && l.etapaLead.toLowerCase().includes("follow-up") &&
      l.comparecimento !== "COMPARECEU"
  );

  const actionCommands: ActionCommand[] = [];
  urgenteLeads.slice(0, 2).forEach((l) => {
    // triage: skip URGENTE if >=2 recent attempts in last 3h
    const attempts = countRecentAttempts(l, 3);
    if (attempts >= 2) return;
    actionCommands.push({
      acao: `Recuperar lead para evitar perda de agendamento!`,
      cliente: l.nome,
      clienteLink: getWALink(l.telefone),
      motivo: `Lead agendado para hoje/amanhã com status ${l.status || "-"}.`,
      tempo: "Imediato",
      nivel: "URGENTE",
    });
  });
  prioritarioLeads.slice(0, 2).forEach((l) => {
    actionCommands.push({
      acao: `Atribuir responsável ao lead!`,
      cliente: l.nome,
      clienteLink: getWALink(l.telefone),
      motivo: `Lead sem responsável/captador definido.`,
      tempo: "Hoje",
      nivel: "PRIORITÁRIO",
    });
  });
  rotinaLeads.slice(0, 2).forEach((l) => {
    actionCommands.push({
      acao: `Realizar follow-up pendente`,
      cliente: l.nome,
      clienteLink: getWALink(l.telefone),
      motivo: `Lead está em etapa de follow-up sem agendamento.`,
      tempo: "Até o fim do dia",
      nivel: "ROTINA",
    });
  });

  return (
    <div className="space-y-6">
      {/* Hero Operational Block - Situation summary and decision prompts */}
      <HeroOperationalBlock leads={leads} ticketAverage={ticketAverage || 120} onPrioritize={openPrioritize} />

      {/* Prioritize modal */}
      {showPrioritize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl bg-card p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Lista Operacional — Priorizar D1–D3</h3>
              <div className="flex gap-2">
                <button onClick={() => { autoAssignLeads(prioritized); }} className="px-3 py-1 bg-emerald-600 text-white rounded">Auto-assign</button>
                <button onClick={() => setShowPrioritize(false)} className="px-3 py-1 bg-muted rounded">Fechar</button>
              </div>
            </div>
            <div className="mt-3 max-h-80 overflow-auto">
              <table className="w-full text-sm table-auto">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Dias</th>
                    <th>Etapa</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {prioritized.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2">{p.nome}</td>
                      <td>{p.telefone}</td>
                      <td>{daysSinceCreation(p.dataCriacao)}</td>
                      <td>{p.etapaLead}</td>
                      <td className="py-2">
                        <button onClick={() => { const w = getWALink(p.telefone); if (w) window.open(w, '_blank'); }} className="mr-2 px-2 py-1 bg-primary text-white rounded">WhatsApp</button>
                        <button onClick={async () => { await autoAssignLeads([p]); }} className="px-2 py-1 bg-amber-600 text-white rounded">Atribuir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Action Command Cards - Top Priority */}
      {actionCommands.length > 0 && (
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">Comandos de Ação Operacional</h3>
          <div className="flex flex-col gap-2">
            {actionCommands.map((cmd, idx) => (
              <ActionCommandCard key={cmd.nivel + cmd.cliente + idx} command={cmd} />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm text-muted-foreground">Período:</label>
          <select value={periodPreset} onChange={(e) => setPeriodPreset(e.target.value)} className="rounded px-2 py-1 border">
            <option value="last_7">Últimos 7 dias</option>
            <option value="last_30">Últimos 30 dias</option>
            <option value="month_current">Mês atual</option>
            <option value="month_prev">Mês anterior</option>
          </select>
          <div className="text-sm text-muted-foreground">{periodLabel}</div>
        </div>
        <div className="text-sm text-muted-foreground">Dados até: {lastSyncedAt ?? '—'} • Fonte: {dataSource ?? '—'}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <KPIExecutiveCard title="Total de Leads" value={totalLeads} subtitle="Últimos 7 dias" sparkline={sparkLast7} delta={deltaTotal.delta} deltaDirection={deltaTotal.dir} />
        <KPIExecutiveCard title="Agendados" value={agendados} subtitle="Agendamentos" sparkline={sparkLast7} delta={deltaAgend.delta} deltaDirection={deltaAgend.dir} />
        <KPIExecutiveCard title="Compareceram" value={compareceram} subtitle="Comparecimento" sparkline={sparkLast7} delta={deltaComp.delta} deltaDirection={deltaComp.dir} />
        <KPIExecutiveCard title="Follow-ups Pend." value={followupsPend} subtitle="Ações pendentes" sparkline={sparkLast7} delta={deltaFollow.delta} deltaDirection={deltaFollow.dir} />
        <KPIExecutiveCard title="Receita Prevista" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaPrevista)} subtitle={periodLabel} sparkline={sparkLast7} delta={deltaReceita.delta} deltaDirection={deltaReceita.dir} />
        <KPIExecutiveCard title="CAC / ROI" value="—" subtitle="Dados de custo não informados" sparkline={sparkLast7} />
      </div>

      <div className="grid gap-6 md:gap-8 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Alertas Estratégicos</h3>
              <div className="text-sm text-muted-foreground">Prioridade: Alta → Baixa</div>
            </div>
            <div className="mt-3">
              <div className="bg-card p-4 rounded-lg">
                {/* Alerts feed */}
                <div>
                  {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                  {/* @ts-ignore */}
                  <AlertsFeed leads={leads} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Performance Operacional</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Use existing ranking as placeholder */}
              <div>
                <RankingRecepcionistasCard leads={leads} />
              </div>
              <div>
                <div className="space-y-3">
                  <PerformanceBarCard label="Tempo médio até primeiro contato (min)" value={30} max={120} />
                  <PerformanceBarCard label="Taxa de resposta 24h (%)" value={68} max={100} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Previsão de Faturamento</h3>
            <div className="mt-3"><ForecastBlock leads={leads} /></div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold">Índice Preditivo</h3>
            <div className="mt-3"><PredictiveScoreCard leads={leads} /></div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold">Performance por Fonte</h3>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <SourcePerformanceCard source="Online" cac={120} roi={150} conversion={4.5} />
              <SourcePerformanceCard source="Google" cac={180} roi={120} conversion={3.8} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
