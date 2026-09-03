import React, { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import LegacyCampaignCard from "./CampaignCardLegacy";
import type { Campaign } from "@/types/commandCenter";
import {
  buildMondayActions,
  buildMonthlyProjection,
  buildOperationalScalePlan,
  buildPortfolioAllocationPlan,
  buildStrategicContext,
  buildWeeklyRisk,
} from "@/lib/mpcDecisionEngine";

type Props = ComponentProps<typeof LegacyCampaignCard>;

function fmt(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function scrubLegacyPanel(root: HTMLElement) {
  const replacements: Array<[RegExp, string]> = [
    [/Cliques/g, "Conversas"],
    [/cliques/g, "conversas"],
    [/CPC \(R\$\)/g, "Custo/conversa (R$)"],
    [/CPC/g, "Custo/Conversa"],
    [/Custo\/clique/g, "Custo por conversa"],
    [/custo\/clique/g, "custo por conversa"],
    [/Conversão para paciente/g, "Lead → comparecimento"],
    [/^Conversão$/g, "Agend. → comparecimento"],
    [/Capacidade Operacional/g, "Sinal operacional do funil"],
    [/Gate de capacidade/g, "Sinal operacional do funil"],
    [/Disponivel para escalar/g, "Sem alerta operacional pelo funil"],
    [/Atencao operacional/g, "Validar operacao antes de escalar"],
    [/Pacientes pendentes/g, "Agend. sem comparecimento"],
    [/Pacientes aguardando confirmacao/g, "Agendamentos sem comparecimento"],
    [/Escalas para executar/g, "Escalas para avaliar"],
    [/Vídeos\/creativos pendentes/g, "Criativos para revisar"],
    [/Receita potencial/g, "Valor potencial"],
    [/Conclusao:/g, "Leitura:"],
    [/Segunda-feira/g, "Plano de acao de hoje"],
    [/Carteira amanha/g, "Alocacao adicional sugerida"],
    [/Probabilidade de bater a meta/g, "Aderencia do ritmo a meta"],
  ];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  nodes.forEach((node) => {
    let value = node.nodeValue || "";
    replacements.forEach(([pattern, replacement]) => {
      value = value.replace(pattern, replacement);
    });
    value = value.replace(/\b(Alta|Media|Baixa) \(\d+%\)/g, "$1");
    if (value !== node.nodeValue) node.nodeValue = value;
  });

  root.querySelectorAll<HTMLElement>("p,span").forEach((el) => {
    const text = (el.textContent || "").trim();
    if (
      text.startsWith("Agenda ocupada:") ||
      text.startsWith("Tempo medio de resposta:") ||
      text.startsWith("Dentistas com disponibilidade:")
    ) {
      el.style.display = "none";
    }
  });

  const paragraphs = Array.from(root.querySelectorAll<HTMLElement>("p"));

  // O bloco estrategico antigo e substituido pelo painel auditado abaixo.
  const priorityHeading = paragraphs.find((el) =>
    (el.textContent || "").toLowerCase().includes("prioridade estrategica")
  );
  const oldStrategicGrid = priorityHeading?.closest<HTMLElement>("div.grid");
  if (oldStrategicGrid) oldStrategicGrid.style.display = "none";

  // A meta mensal antiga misturava realizado, projecao e probabilidade heuristica.
  const monthHeading = paragraphs.find((el) =>
    (el.textContent || "").trim().toLowerCase() === "meta do mes"
  );
  let monthBlock = monthHeading?.parentElement;
  while (monthBlock && monthBlock !== root) {
    if (monthBlock.classList.contains("rounded-lg") && monthBlock.classList.contains("mb-4")) {
      monthBlock.style.display = "none";
      break;
    }
    monthBlock = monthBlock.parentElement;
  }
}

function CleanStrategicPanel({ campaigns, ticketMedio }: { campaigns: Campaign[]; ticketMedio: number }) {
  const active = campaigns.filter((campaign) => campaign.active);
  const [extraBudget, setExtraBudget] = useState(30);
  const [completedActions, setCompletedActions] = useState<string[]>([]);

  if (active.length === 0) return null;

  const strategicRanking = active
    .map((campaign) => ({ campaign, ctx: buildStrategicContext(campaign, ticketMedio) }))
    .sort((a, b) => b.ctx.priorityScore - a.ctx.priorityScore);

  const scalePlan = buildOperationalScalePlan(active, ticketMedio);
  const portfolioPlan = buildPortfolioAllocationPlan(active, ticketMedio, extraBudget);
  const weeklyRisk = buildWeeklyRisk(active, ticketMedio);
  const dailyActions = buildMondayActions(active, ticketMedio);
  const actionableToday = dailyActions.filter((action) => {
    const text = `${action.title} ${action.eta}`.toLowerCase();
    return !/manter|aguardar dados|sem acao operacional|nenhuma acao/.test(text);
  });
  const visibleActions = actionableToday.filter((action) => !completedActions.includes(action.id));
  const completedCount = actionableToday.filter((action) => completedActions.includes(action.id)).length;
  const planPct = actionableToday.length > 0
    ? Math.round((completedCount / actionableToday.length) * 100)
    : 100;

  const monthScoped: Campaign[] = active.map((campaign) => ({
    ...campaign,
    leads: campaign.monthLeads ?? campaign.leads,
    scheduled: campaign.monthScheduled ?? campaign.scheduled,
    completed: campaign.monthCompleted ?? campaign.completed,
  }));
  const monthlyProjection = buildMonthlyProjection(monthScoped, 50);
  const monthCompletedActual = monthScoped.reduce((sum, campaign) => sum + campaign.completed, 0);
  const monthProgressPct = monthlyProjection.targetCompleted > 0
    ? Math.min(Math.round((monthCompletedActual / monthlyProjection.targetCompleted) * 100), 100)
    : 0;
  const hasPaceBase = monthCompletedActual > 0;
  const monthLabel = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <>
      <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <p style={{ color: "#777", fontSize: "10px" }} className="uppercase tracking-wider">DADO + ESTIMATIVA IDENTIFICADA</p>
            <p style={{ color: "#fff", fontSize: "16px" }} className="font-bold capitalize">Meta de {monthLabel}</p>
          </div>
          <p style={{ color: "#9ca3af", fontSize: "11px" }}>Meta: {monthlyProjection.targetCompleted} comparecimentos</p>
        </div>
        <div className="h-2 rounded-full bg-[#303030] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${monthProgressPct}%`, background: monthProgressPct >= 100 ? "#10b981" : "#3b82f6" }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
          <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
            <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Realizado • DADO</p>
            <p style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">{monthCompletedActual} comparecimentos</p>
          </div>
          <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
            <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Ritmo projetado • ESTIMATIVA</p>
            <p style={{ color: hasPaceBase ? "#3b82f6" : "#9ca3af", fontSize: "13px" }} className="font-semibold">
              {hasPaceBase ? `${monthlyProjection.projectedCompleted} comparecimentos` : "Sem base suficiente"}
            </p>
          </div>
          <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
            <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Leitura do ritmo</p>
            <p style={{ color: hasPaceBase ? "#10b981" : "#9ca3af", fontSize: "12px" }} className="font-semibold">
              {hasPaceBase ? `${monthlyProjection.probability}% da meta no ritmo atual` : "Aguardando primeiros comparecimentos"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4">
        <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
          <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold uppercase tracking-wider">Prioridade estrategica</p>
          <p style={{ color: "#777", fontSize: "9px" }} className="mb-2">DIAGNOSTICO • ranking calculado com eficiencia, funil e volume</p>
          <div className="space-y-2">
            {strategicRanking.slice(0, 3).map(({ campaign, ctx }, idx) => (
              <div key={campaign.id} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
                <p style={{ color: "#999", fontSize: "9px" }} className="uppercase">
                  {idx === 0 ? "Prioridade Alta" : idx === 1 ? "Prioridade Media" : "Prioridade Baixa"}
                </p>
                <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">{campaign.name}</p>
                <p style={{ color: "#d1d5db", fontSize: "10px" }}>{ctx.why}</p>
                <p style={{ color: "#9ca3af", fontSize: "10px" }}>CPL: {campaign.cacLead > 0 ? fmt(campaign.cacLead) : "—"}</p>
                <p style={{ color: "#9ca3af", fontSize: "10px" }}>Valor potencial*: {fmt(ctx.revenuePotential)}</p>
                <p style={{ color: "#60a5fa", fontSize: "10px" }}>{ctx.shortAction}</p>
              </div>
            ))}
          </div>
          <p style={{ color: "#666", fontSize: "9px" }} className="mt-2">* Comparecimentos x ticket medio; nao representa faturamento realizado.</p>
        </div>

        <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
          <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold uppercase tracking-wider">Plano operacional por campanha</p>
          <p style={{ color: "#777", fontSize: "9px" }} className="mb-2">DIAGNOSTICO • budget exibido e o cadastrado no Rede Leads, ainda nao sincronizado da Meta</p>
          <div className="space-y-2">
            {scalePlan.slice(0, 4).map((row) => (
              <div key={row.campaignId} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
                <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">{row.campaignName}</p>
                <p style={{ color: "#d1d5db", fontSize: "10px" }}>Budget cadastrado: R${row.currentDailyBudget.toFixed(0)}/dia</p>
                {row.deltaDailyBudget > 0 ? (
                  <>
                    <p style={{ color: "#10b981", fontSize: "10px" }}>Sugestao: R${row.recommendedDailyBudget.toFixed(0)}/dia (+R${row.deltaDailyBudget.toFixed(0)})</p>
                    <p style={{ color: "#aaa", fontSize: "10px" }}>Status: {row.statusLabel}</p>
                    <p style={{ color: "#aaa", fontSize: "10px" }}>ESTIMATIVA linear: +{row.expectedLeads} leads | +{row.expectedCompleted} comparecimentos</p>
                    <p style={{ color: "#10b981", fontSize: "10px" }}>Valor potencial estimado: {fmt(row.expectedRevenue)}</p>
                  </>
                ) : (
                  <>
                    <p style={{ color: "#d1d5db", fontSize: "10px" }}>Verba: sem alteracao sugerida</p>
                    <p style={{ color: "#aaa", fontSize: "10px" }}>Status: {row.statusLabel}</p>
                    <p style={{ color: "#777", fontSize: "10px" }}>Sem projecao de incremento: nao ha aumento de verba sugerido.</p>
                  </>
                )}
                <p style={{ color: "#9ca3af", fontSize: "10px" }}>Revisao: {row.nextReviewText}</p>
                <p style={{ color: "#777", fontSize: "10px" }}>{row.reason}</p>
              </div>
            ))}
          </div>

          <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2 mt-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p style={{ color: "#fff", fontSize: "10px" }} className="font-semibold uppercase">Alocacao adicional sugerida</p>
                <p style={{ color: "#777", fontSize: "9px" }}>SIMULACAO • informe verba extra disponivel</p>
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: "#999", fontSize: "10px" }}>R$</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={extraBudget}
                  onChange={(event) => setExtraBudget(Number(event.target.value || 0))}
                  style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "10px", width: 70 }}
                  className="rounded px-2 py-1"
                />
              </div>
            </div>
            {portfolioPlan.items.length > 0 ? (
              <div className="space-y-1 mt-2">
                {portfolioPlan.items.map((item) => (
                  <div key={item.campaignId}>
                    <p style={{ color: "#d1d5db", fontSize: "10px" }}>{fmt(item.allocatedBudget)} → {item.campaignName}</p>
                    <p style={{ color: "#777", fontSize: "9px" }}>{item.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#777", fontSize: "10px" }} className="mt-2">Sem alocacao adicional sugerida no momento.</p>
            )}
            {portfolioPlan.blockedCampaigns.length > 0 && (
              <p style={{ color: "#f59e0b", fontSize: "9px" }} className="mt-1">
                Sem recomendacao para: {portfolioPlan.blockedCampaigns.map((item) => item.campaignName).join(", ")}
              </p>
            )}
          </div>
        </div>

        <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
          <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold uppercase tracking-wider">Plano de acao de hoje</p>
          <p style={{ color: "#777", fontSize: "9px" }} className="mb-2">{todayLabel} • somente itens que exigem decisao ou execucao</p>
          <div className="space-y-2">
            {visibleActions.length > 0 ? visibleActions.map((action) => (
              <div key={action.id} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
                <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">□ {action.title}</p>
                <p style={{ color: "#9ca3af", fontSize: "10px" }}>{action.eta}{action.due ? ` • ${action.due}` : ""}</p>
                <p style={{ color: "#9ca3af", fontSize: "10px" }}>Impacto: {action.impact}</p>
                <button
                  onClick={() => setCompletedActions((prev) => [...prev, action.id])}
                  style={{ border: "0.5px solid #3a3a3a", color: "#d1d5db", fontSize: "10px" }}
                  className="mt-1 px-2 py-1 rounded hover:bg-[#323232]"
                >
                  ✓ Concluir
                </button>
              </div>
            )) : (
              <p style={{ color: "#10b981", fontSize: "10px" }}>Nenhuma acao prioritaria hoje. Manter monitoramento.</p>
            )}
          </div>
          <p style={{ color: planPct === 100 ? "#10b981" : "#777", fontSize: "10px" }} className="mt-2">Plano do dia: {planPct}%</p>

          <div style={{ background: "#262626", border: `0.5px solid ${weeklyRisk.color}` }} className="rounded p-2 mt-2">
            <p style={{ color: weeklyRisk.color, fontSize: "11px" }} className="font-semibold">Risco da semana: {weeklyRisk.emoji} {weeklyRisk.label}</p>
            <p style={{ color: "#aaa", fontSize: "10px" }}>{weeklyRisk.reason}</p>
            <p style={{ color: weeklyRisk.potentialRevenueLoss > 0 ? "#ef4444" : "#777", fontSize: "10px" }}>Valor potencial em risco: {fmt(weeklyRisk.potentialRevenueLoss)}</p>
          </div>

          <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2 mt-2">
            <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">Ritmo da meta mensal</p>
            <p style={{ color: "#aaa", fontSize: "10px" }}>Realizado: {monthCompletedActual} | Meta: {monthlyProjection.targetCompleted} | Faltam: {monthlyProjection.missing}</p>
            <p style={{ color: "#aaa", fontSize: "10px" }}>
              {hasPaceBase ? `Ritmo projetado: ${monthlyProjection.projectedCompleted} comparecimentos` : "Projecao: sem base suficiente neste mes"}
            </p>
            <p style={{ color: hasPaceBase ? "#10b981" : "#777", fontSize: "10px" }}>
              {hasPaceBase ? `Aderencia do ritmo: ${monthlyProjection.probability}% da meta` : "Aguardando primeiros comparecimentos para calcular ritmo."}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function CampaignCard(props: Props) {
  const legacyRef = useRef<HTMLDivElement>(null);
  const showCleanStrategic = props.period !== "operacao" && props.period !== "ciclo" && props.period !== "historico";

  useEffect(() => {
    const root = legacyRef.current;
    if (!root) return;

    const apply = () => scrubLegacyPanel(root);
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [props.period, props.campaigns]);

  return (
    <>
      {showCleanStrategic && (
        <CleanStrategicPanel campaigns={props.campaigns} ticketMedio={props.ticketMedio} />
      )}
      <div ref={legacyRef}>
        <LegacyCampaignCard {...props} />
      </div>
    </>
  );
}
