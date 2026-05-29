# Dashboard Executivo — Wireframes e Especificação Visual

Objetivo: reformular visualmente o `Dashboard Executivo` preservando identidade existente, elevando percepção para um produto premium enterprise.

Princípios
- Manter paleta, tipografia e identidade.
- Maximizar hierarquia: KPIs no topo, depois alertas, depois blocos analíticos.
- Respirar: mais espaços em branco, menos densidade tabular.
- Visual executivo: números grandes, micro-tendências, badges de delta.

== 1. Visão geral do layout (desktop) ==

- Grid principal: 12-colunas com gutters amplos.
- Topo Executivo (row 1): 6 cards KPIExecutiveCard (col-span: each 2) — altura maior, número central grande, sparkline pequena, delta badge.
- Row 2 (duas colunas):
  - Left (col-span 8): Alertas Estratégicos (feed + cartão resumido Leads em Risco Operacional)
  - Right (col-span 4): Previsão de Faturamento (linha + forecast band, resumo em valores)
- Row 3 (três colunas principais):
  - Performance Operacional (col-span 5): barras por captador, top N
  - Índice Preditivo de Conversão (col-span 2): score grande + distribuição
  - Performance por Fonte (col-span 5): cards por canal (mini-donut + KPIs)
- Row 4: Risco Operacional (full width) — impacto financeiro + leads críticos
- Row 5: Central de Insights Estratégicos (full width) — 3–5 insights priorizados

== 2. Componentes principais ==

1) `KPIExecutiveCard`
- Uso: top KPIs (Receita Prevista, Receita Realizada, Conversão, Comparecimento, CAC, ROI, Gargalo)
- Estrutura:
  - Título (sm)
  - Número principal (xxpx, bold)
  - Delta badge (verde/vermelho) com %
  - Sparkline compacto (altura 24px)
  - Context (subtexto, ex: período)
- Estilo: fundo `--card-bg` (leve), borda-radius 12px, shadow suave (e.g., `shadow-lg/5%`), padding generoso.

2) `AlertItem` / `AlertsFeed`
- Uso: lista de alertas estratégicos ordenada por prioridade.
- Campos: nível (Alta/Média/Baixa), título, razão (ex.: "queda conversão 15% fonte FB"), impacto estimado (R$), timestamp, quick-actions.
- Visual: cor por prioridade (amarelo/laranja/vermelho), ícone de triagem, micro-bar de severidade.

3) `PerformanceBarCard`
- Uso: mostrar desempenho por membro/equipe.
- Elementos: nome, valor (número), barra relativa com cor de performance, KPI secundário (conversão), medalha/top3.

4) `PredictiveScoreCard`
- Uso: índice preditivo de conversão/IA.
- Elementos: score 0–100 grande (central), distribuição por faixas, probabilidade média, recomendações (3 ações).
- Visual: gradiente suave (mantendo tom da marca), tratamento tipográfico imponente.

5) `SourcePerformanceCard`
- Uso: por canal — CAC, ROI, taxa de comparecimento, conversão.
- Visual: mini-donut, número grande, trend small.

6) `ForecastBlock`
- Uso: gráfico principal previsão vs realizado.
- Elementos: linha principal (realizado), linha forecast (dashed), banda de confiança, ticks de evento (promoções), KPI resumo (previsto/realizado/ticket médio/desperdício).

7) `InsightsList` (Central de Inteligência Operacional)
- Cartões compactos com título, explicação curta, impacto estimado, botão "Ação" (ex.: "Priorizar 24 leads").

== 3. Tokens e Tipografia (aplicável ao tema existente) ==

- Font sizes (ex):
  - KPI number: 28–36px (desktop)
  - KPI title: 12–14px
  - Card titles: 14–16px
  - Body text: 13–14px
- Spacing:
  - Gutter horizontal: 24px (desktop)
  - Card padding: 18–22px
- Border radius: 10–12px
- Shadows: leve (ex: 0 6px 18px rgba(16,24,40,0.04))

== 4. Interações e Micro-UX ==

- Hover: elevação suave do card + shadow incrementado.
- Click em KPI: open drilldown (slide-over) com métricas detalhadas.
- Alert action: marcar como resolvido / criar tarefa / priorizar.
- Export: botão claro no topo do ForecastBlock e Insights.

== 5. Acessibilidade e Performance ==

- Garantir contraste mínimo WCAG 4.5:1 para números importantes.
- Evitar charts pesados client-side; usar lightweight sparklines e prerenderar no servidor quando possível.

== 6. Implementação (passos recomendados) ==

1. Validar wireframe com stakeholdes (rápida revisão). 2–3 iterações.
2. Criar kit de componentes `KPIExecutiveCard`, `AlertItem`, `PredictiveScoreCard` em `src/components/crm/executive/`.
3. Implementar `src/pages/DashboardExecutivo.tsx` usando novos componentes; integrar `useLeads` para dados.
4. Testes visuais e QA (responsividade). 5. Deploy incremental.

== 7. Anexos — Wireframe ASCII (desktop)

--------------------------------------------------------------------------------
| KPI1 | KPI2 | KPI3 | KPI4 | KPI5 | KPI6 |
|-----------------------------------------------------------------------|
| Alerts (8) (col-span 8)               | Forecast (col-span 4)         |
|                                       |                              |
| Performance (5) | Predictive (2) | Sources (5)                    |
|                                                                       |
| Risco Operacional (full width)                                         |
| Insights Estratégicos (full width)                                     |
--------------------------------------------------------------------------------

-- Fim do documento --
