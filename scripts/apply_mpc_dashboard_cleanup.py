from pathlib import Path

path = Path("src/components/crm/commandcenter/CampaignCard.tsx")
s = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"[{label}] esperado 1 match, encontrado {count}")
    s = s.replace(old, new, 1)


# 1) Semantica visual: o campo legado `clicks` representa conversas iniciadas.
s = s.replace("Cliques", "Conversas")
s = s.replace("cliques", "conversas")
s = s.replace("CPC (R$)", "Custo/conversa (R$)")
s = s.replace("CPC", "Custo/Conversa")
s = s.replace("Custo/clique", "Custo por conversa")
s = s.replace("custo/clique", "custo por conversa")
s = s.replace("sem conversas)", "sem conversas)")

# Nomes de conversao sem ambiguidade.
s = s.replace('{ label: "Conversão", value: campaign.showUpRate > 0 ? `${campaign.showUpRate}%` : "—", target: ">= 50%", ok: campaign.showUpRate >= 50 },',
              '{ label: "Agend. → comparecimento", value: campaign.showUpRate > 0 ? `${campaign.showUpRate}%` : "—", target: ">= 50%", ok: campaign.showUpRate >= 50 },')
s = s.replace("Conversão para paciente", "Lead → comparecimento")

# 2) Acoes deixam de ser semanticamente vinculadas a segunda-feira.
replace_once(
'''  const mondayActions = buildMondayActions(active, ticketMedio);\n  const visibleActions = mondayActions.filter((a) => !completedActions.includes(a.id));''',
'''  // O motor ainda mantem o nome legado buildMondayActions por compatibilidade,\n  // mas a lista e recalculada diariamente e representa as acoes do dia atual.\n  const dailyActions = buildMondayActions(active, ticketMedio);\n  const visibleActions = dailyActions.filter((a) => !completedActions.includes(a.id));''',
"daily-actions",
)

replace_once(
'''  const monitorActions = visibleActions.filter((action) => {\n    const text = `${action.id} ${action.title}`.toLowerCase();\n    return /aguardar|monitorar|validar/.test(text);\n  });\n  const actionableTotal = executeActions.length + monitorActions.length;\n  const executedPct = actionableTotal > 0 ? Math.round((completedActions.length / (completedActions.length + actionableTotal)) * 100) : 100;''',
'''  const monitorActions = visibleActions.filter((action) => {\n    const text = `${action.id} ${action.title}`.toLowerCase();\n    return /aguardar|monitorar|validar/.test(text);\n  });\n  const dailyPanelActions = visibleActions.filter((action) => {\n    const text = `${action.id} ${action.title} ${action.eta}`.toLowerCase();\n    return !/manter|aguardar dados|sem acao operacional|nenhuma acao/.test(text);\n  });\n  const actionableTotal = executeActions.length + monitorActions.length;\n  const dailyCompletedCount = completedActions.filter((id) => dailyActions.some((action) => action.id === id)).length;\n  const executedPct = dailyActions.length > 0 ? Math.round((dailyCompletedCount / dailyActions.length) * 100) : 100;''',
"daily-panel-filter",
)

# 3) Remove a falsa precisao de ocupacao de agenda.
replace_once(
'''  const agendaOccupancyPct = Math.min(95, Math.max(5, Math.round((totalScheduled / Math.max(active.length * 20, 1)) * 100)));\n''',
'''  // Ocupacao real da agenda ainda nao esta integrada. Nao estimar percentual ficticio.\n''',
"fake-agenda-occupancy",
)

# 4) Base mensal: separar realizado de projecao de ritmo.
replace_once(
'''  const monthlyProjection = buildMonthlyProjection(monthScopedActive, 50);\n  const mpcDiagnostic = buildMpcDiagnostic(active, monthlyProjection.targetCompleted);\n  const currentMonthLabel = new Date().toLocaleDateString("pt-BR", { month: "long" });''',
'''  const monthlyProjection = buildMonthlyProjection(monthScopedActive, 50);\n  const monthCompletedActual = monthScopedActive.reduce((sum, campaign) => sum + campaign.completed, 0);\n  const hasMonthlyPaceBase = monthCompletedActual > 0;\n  const monthProgressPct = monthlyProjection.targetCompleted > 0\n    ? Math.min(Math.round((monthCompletedActual / monthlyProjection.targetCompleted) * 100), 100)\n    : 0;\n  const mpcDiagnostic = buildMpcDiagnostic(active, monthlyProjection.targetCompleted);\n  const currentMonthLabel = new Date().toLocaleDateString("pt-BR", { month: "long" });\n  const todayLabel = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });''',
"monthly-base",
)

# 5) Decisao do dia: recomendacao, nao ordem automatica.
s = s.replace('title: "Aumente investimento hoje",', 'title: "Avaliar escala hoje",')
s = s.replace('recommendation: `R$${topScaleCandidate.ctx.decision.budgetCurrent.toFixed(0)} -> R$${topScaleCandidate.ctx.decision.budgetRecommended.toFixed(0)}/dia`,',
              'recommendation: `Sugestao sobre budget cadastrado: R$${topScaleCandidate.ctx.decision.budgetCurrent.toFixed(0)} -> R$${topScaleCandidate.ctx.decision.budgetRecommended.toFixed(0)}/dia. Confirmar o valor real na Meta antes de executar.`,')
s = s.replace('impact: `Impacto esperado: +${topScaleCandidate.ctx.projection20.leads} leads, +${topScaleCandidate.ctx.projection20.completed} comparecimentos, receita potencial ${fmt(topScaleCandidate.ctx.projection20.revenue)}.`,',
              'impact: `Estimativa linear, nao previsao: +${topScaleCandidate.ctx.projection20.leads} leads, +${topScaleCandidate.ctx.projection20.completed} comparecimentos e ${fmt(topScaleCandidate.ctx.projection20.revenue)} de valor potencial.`,')
s = s.replace('recommendation: "Escala bloqueada por capacidade operacional",', 'recommendation: "Validar operacao antes de escalar",')
s = s.replace('impact: "Priorize destravar confirmacoes/agenda antes de novo volume de leads.",',
              'impact: "Ha sinal de gargalo entre agendamento e comparecimento. Validar confirmacoes antes de aumentar volume.",')

# 6) Central operacional: trocar capacidade ficticia por sinal observavel do funil.
old_capacity = '''            <p style={{ color: "#9ca3af", fontSize: "10px" }} className="uppercase">Capacidade Operacional</p>\n            <p style={{ color: capacityGate.canScale ? "#10b981" : "#f59e0b", fontSize: "11px" }} className="font-semibold">\n              {capacityGate.canScale ? "Disponivel para escalar" : "Atencao operacional"}\n            </p>\n            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Agenda ocupada: {agendaOccupancyPct}%</p>\n            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Pacientes aguardando confirmacao: {capacityGate.pendingConfirmations}</p>\n            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Taxa de comparecimento atual: {showUpPct}%</p>\n            <p style={{ color: "#666", fontSize: "10px" }}>Tempo medio de resposta: sem integracao de dado</p>\n            <p style={{ color: "#666", fontSize: "10px" }}>Dentistas com disponibilidade: sem integracao de dado</p>\n            <p style={{ color: "#9ca3af", fontSize: "10px" }} className="mt-1">Conclusao: {capacityGate.reason}</p>'''
new_capacity = '''            <p style={{ color: "#9ca3af", fontSize: "10px" }} className="uppercase">Sinal operacional do funil</p>\n            <p style={{ color: capacityGate.canScale ? "#10b981" : "#f59e0b", fontSize: "11px" }} className="font-semibold">\n              {capacityGate.canScale ? "Sem alerta operacional pelo funil" : "Validar operacao antes de escalar"}\n            </p>\n            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Agendamentos sem comparecimento: {capacityGate.pendingConfirmations}</p>\n            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Taxa de comparecimento no periodo: {showUpPct}%</p>\n            <p style={{ color: "#666", fontSize: "10px" }}>Este sinal nao mede ocupacao real da agenda, tempo de resposta nem disponibilidade de dentistas.</p>\n            <p style={{ color: "#9ca3af", fontSize: "10px" }} className="mt-1">Leitura: {capacityGate.reason}</p>'''
replace_once(old_capacity, new_capacity, "operational-signal")

s = s.replace("Pacientes pendentes", "Agend. sem comparecimento")
s = s.replace("Escalas para executar", "Escalas para avaliar")
s = s.replace("Vídeos/creativos pendentes", "Criativos para revisar")
s = s.replace("Gate de capacidade", "Sinal operacional do funil")
s = s.replace('{capacityGate.canScale ? "Escala liberada" : "Escala bloqueada"} • Pendentes: {capacityGate.pendingConfirmations}',
              '{capacityGate.canScale ? "Sem alerta pelo funil" : "Validar operacao"} • Agend. sem comparecimento: {capacityGate.pendingConfirmations}')

# 7) Meta mensal: progresso real + ritmo projetado explicitamente identificado.
s = s.replace('width: `${Math.min(Math.round((monthlyProjection.projectedCompleted / Math.max(monthlyProjection.targetCompleted, 1)) * 100), 100)}%`,',
              'width: `${monthProgressPct}%`,')
s = s.replace('background: monthlyProjection.projectedCompleted >= monthlyProjection.targetCompleted ? "#10b981" : "#3b82f6",',
              'background: monthCompletedActual >= monthlyProjection.targetCompleted ? "#10b981" : "#3b82f6",')
s = s.replace('{monthlyProjection.projectedCompleted}/{monthlyProjection.targetCompleted} ({Math.round((monthlyProjection.projectedCompleted / Math.max(monthlyProjection.targetCompleted, 1)) * 100)}%)',
              '{monthCompletedActual}/{monthlyProjection.targetCompleted} ({monthProgressPct}%) realizados')

replace_once(
'''              <p style={{ color: "#fff", fontSize: "12px" }} className="font-semibold">Previsao: {monthlyProjection.projectedCompleted}</p>\n              <p style={{ color: "#9ca3af", fontSize: "11px" }}>Faltam: {monthlyProjection.missing} pacientes</p>\n              <p style={{ color: "#10b981", fontSize: "11px" }}>Probabilidade: {monthlyProjection.probability}%</p>''',
'''              <p style={{ color: "#fff", fontSize: "12px" }} className="font-semibold">Ritmo projetado: {hasMonthlyPaceBase ? `${monthlyProjection.projectedCompleted} comparecimentos` : "Sem base suficiente"}</p>\n              <p style={{ color: "#9ca3af", fontSize: "11px" }}>Realizado: {monthCompletedActual} • Faltam: {monthlyProjection.missing}</p>\n              <p style={{ color: hasMonthlyPaceBase ? "#10b981" : "#9ca3af", fontSize: "11px" }}>\n                {hasMonthlyPaceBase ? `Aderencia do ritmo: ${monthlyProjection.probability}% da meta` : "Aguardando primeiros comparecimentos do mes para projetar ritmo."}\n              </p>''',
"monthly-card",
)

# 8) Ranking estrategico: separar diagnostico de estimativa.
s = s.replace("Prioridade estrategica", "Prioridade estrategica • DIAGNOSTICO")
s = s.replace("Receita prevista ", "Valor potencial (ticket medio) ")

# 9) Plano por campanha: nao projetar incremento quando a verba nao muda.
s = s.replace("Escala recomendada", "Plano operacional por campanha")
s = s.replace("Painel operacional diario por campanha", "DIAGNOSTICO • leitura operacional por campanha")
s = s.replace("Atual -> Proximo, impacto e momento da revisao", "Budget cadastrado -> sugestao. Estimativas so aparecem quando existe aumento de verba.")
s = s.replace('Atual: R${row.currentDailyBudget.toFixed(0)}/dia', 'Budget cadastrado: R${row.currentDailyBudget.toFixed(0)}/dia')

old_scale_lines = '''                  <p style={{ color: row.deltaDailyBudget > 0 ? "#10b981" : "#d1d5db", fontSize: "10px" }}>Proximo: R${row.recommendedDailyBudget.toFixed(0)}/dia ({row.deltaDailyBudget >= 0 ? "+" : ""}R${row.deltaDailyBudget.toFixed(0)})</p>\n                  <p style={{ color: "#aaa", fontSize: "10px" }}>Status: {row.statusLabel}</p>\n                  <p style={{ color: "#aaa", fontSize: "10px" }}>Impacto: +{row.expectedLeads} leads | +{row.expectedCompleted} comp.</p>\n                  <p style={{ color: "#10b981", fontSize: "10px" }}>Receita esperada: {fmt(row.expectedRevenue)}</p>'''
new_scale_lines = '''                  {row.deltaDailyBudget > 0 ? (\n                    <>\n                      <p style={{ color: "#10b981", fontSize: "10px" }}>Sugestao: R${row.recommendedDailyBudget.toFixed(0)}/dia (+R${row.deltaDailyBudget.toFixed(0)})</p>\n                      <p style={{ color: "#aaa", fontSize: "10px" }}>Status: {row.statusLabel}</p>\n                      <p style={{ color: "#aaa", fontSize: "10px" }}>Estimativa linear: +{row.expectedLeads} leads | +{row.expectedCompleted} comp.</p>\n                      <p style={{ color: "#10b981", fontSize: "10px" }}>Valor potencial estimado: {fmt(row.expectedRevenue)}</p>\n                    </>\n                  ) : (\n                    <>\n                      <p style={{ color: "#d1d5db", fontSize: "10px" }}>Verba: sem alteracao sugerida</p>\n                      <p style={{ color: "#aaa", fontSize: "10px" }}>Status: {row.statusLabel}</p>\n                      <p style={{ color: "#777", fontSize: "10px" }}>Sem projecao de incremento, pois nao ha aumento de verba sugerido.</p>\n                    </>\n                  )}'''
replace_once(old_scale_lines, new_scale_lines, "scale-row")

# 10) Carteira amanha vira simulacao de verba adicional, sem promessa temporal.
s = s.replace("Carteira amanha", "Alocacao adicional sugerida")
s = s.replace("Bloqueadas: ", "Sem recomendacao de alocacao para: ")

# 11) Plano do dia: titulo dinamico, somente acoes que exigem decisao/execucao.
old_daily_panel = '''            <p style={{ color: "#fff", fontSize: "11px" } } className="font-semibold uppercase tracking-wider mb-2">Segunda-feira</p>\n            <div className="space-y-2">\n              {visibleActions.map((action, idx) => (\n                <div key={`${idx}-${action.id}`} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">\n                  <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">□ {action.title}</p>\n                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>{action.eta}{action.due ? ` • Prazo: ${action.due}` : ""}</p>\n                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>Impacto: {action.impact}</p>\n                  <div className="mt-1">\n                    <button\n                      onClick={() => setCompletedActions((prev) => [...prev, action.id])}\n                      style={{ border: "0.5px solid #3a3a3a", color: "#d1d5db", fontSize: "10px" }}\n                      className="px-2 py-1 rounded hover:bg-[#323232]"\n                    >\n                      ✓ Concluir\n                    </button>\n                  </div>\n                </div>\n              ))}\n            </div>\n            <p style={{ color: executedPct === 100 ? "#10b981" : "#777", fontSize: "10px" } } className="mt-2">Plano executado: {executedPct}%</p>\n            <div style={{ background: "#262626", border: `0.5px solid ${weeklyRisk.color}` }} className="rounded p-2 mt-2">\n              <p style={{ color: weeklyRisk.color, fontSize: "11px" }} className="font-semibold">Risco da semana: {weeklyRisk.emoji} {weeklyRisk.label}</p>\n              <p style={{ color: "#aaa", fontSize: "10px" }}>{weeklyRisk.reason}</p>\n              <p style={{ color: "#ef4444", fontSize: "10px" }}>Receita em risco: {fmt(weeklyRisk.potentialRevenueLoss)}</p>\n            </div>\n            <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" } } className="rounded p-2 mt-2">\n              <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">Probabilidade de bater a meta: {monthlyProjection.probability}%</p>\n              <p style={{ color: "#aaa", fontSize: "10px" }}>Ritmo atual: {monthlyProjection.projectedCompleted} comparecimentos.</p>\n              <p style={{ color: "#aaa", fontSize: "10px" }}>Meta: {monthlyProjection.targetCompleted} | Faltam: {monthlyProjection.missing}</p>\n            </div>'''
new_daily_panel = '''            <p style={{ color: "#fff", fontSize: "11px" } } className="font-semibold uppercase tracking-wider">Plano de acao de hoje</p>\n            <p style={{ color: "#777", fontSize: "9px" }} className="mb-2">{todayLabel} • somente itens que exigem decisao ou execucao</p>\n            <div className="space-y-2">\n              {dailyPanelActions.length > 0 ? dailyPanelActions.map((action, idx) => (\n                <div key={`${idx}-${action.id}`} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">\n                  <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">□ {action.title}</p>\n                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>{action.eta}{action.due ? ` • Prazo: ${action.due}` : ""}</p>\n                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>Impacto: {action.impact}</p>\n                  <div className="mt-1">\n                    <button\n                      onClick={() => setCompletedActions((prev) => [...prev, action.id])}\n                      style={{ border: "0.5px solid #3a3a3a", color: "#d1d5db", fontSize: "10px" }}\n                      className="px-2 py-1 rounded hover:bg-[#323232]"\n                    >\n                      ✓ Concluir\n                    </button>\n                  </div>\n                </div>\n              )) : (\n                <p style={{ color: "#10b981", fontSize: "10px" }}>Nenhuma acao prioritaria hoje. Manter monitoramento das campanhas.</p>\n              )}\n            </div>\n            <p style={{ color: executedPct === 100 ? "#10b981" : "#777", fontSize: "10px" } } className="mt-2">Plano do dia: {executedPct}%</p>\n            <div style={{ background: "#262626", border: `0.5px solid ${weeklyRisk.color}` }} className="rounded p-2 mt-2">\n              <p style={{ color: weeklyRisk.color, fontSize: "11px" }} className="font-semibold">Risco da semana: {weeklyRisk.emoji} {weeklyRisk.label}</p>\n              <p style={{ color: "#aaa", fontSize: "10px" }}>{weeklyRisk.reason}</p>\n              <p style={{ color: weeklyRisk.potentialRevenueLoss > 0 ? "#ef4444" : "#777", fontSize: "10px" }}>Valor potencial em risco: {fmt(weeklyRisk.potentialRevenueLoss)}</p>\n            </div>\n            <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" } } className="rounded p-2 mt-2">\n              <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">Ritmo da meta mensal</p>\n              <p style={{ color: "#aaa", fontSize: "10px" }}>Realizado: {monthCompletedActual} | Meta: {monthlyProjection.targetCompleted} | Faltam: {monthlyProjection.missing}</p>\n              <p style={{ color: "#aaa", fontSize: "10px" }}>\n                {hasMonthlyPaceBase ? `Ritmo projetado: ${monthlyProjection.projectedCompleted} comparecimentos` : "Projecao: sem base suficiente neste mes"}\n              </p>\n              <p style={{ color: hasMonthlyPaceBase ? "#10b981" : "#777", fontSize: "10px" }}>\n                {hasMonthlyPaceBase ? `Aderencia do ritmo: ${monthlyProjection.probability}% da meta` : "Aguardando primeiros comparecimentos para calcular ritmo."}\n              </p>\n            </div>'''
replace_once(old_daily_panel, new_daily_panel, "daily-panel")

# 12) Confianca: exibir faixa qualitativa, nao porcentagem pseudo-estatistica.
s = s.replace('{confidenceCtx.emoji} {decision.confidencePct}%', '{confidenceCtx.emoji} {confidenceCtx.label}')

# Pequenas correcoes de linguagem decorrentes da semantica nova.
s = s.replace("numero de conversas no anúncio", "conversas iniciadas no anúncio")
s = s.replace("Padrão saudável: conversas estáveis e Custo/Conversa baixo.", "Padrão saudável: conversas estáveis e custo por conversa controlado.")
s = s.replace("Se Custo/Conversa > 0 e conversas = 0, houve gasto sem retorno nesse dia.", "Se houve gasto e conversas = 0, não houve conversa iniciada atribuída nesse dia.")

# Validacoes finais contra regressao visual conhecida.
for forbidden in ["Segunda-feira", "Carteira amanha", "Agenda ocupada:", "Probabilidade de bater a meta", ">Cliques<", "Cliques x CPC"]:
    if forbidden in s:
        raise SystemExit(f"texto legado ainda presente: {forbidden}")

path.write_text(s, encoding="utf-8")
print("CampaignCard.tsx limpo com sucesso")
