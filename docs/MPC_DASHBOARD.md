# Painel Executivo MPC — Documentação

## 🎯 Visão Geral

O **Painel Executivo MPC** (Método de Performance e Clareza) é um dashboard minimalista focado em **decisão rápida** para proprietários de clínicas. O objetivo é transformar milhares de dados operacionais em poucos indicadores estratégicos.

**Princípio:** O proprietário deve compreender a situação da clínica em menos de 30 segundos.

---

## 📁 Estrutura de Arquivos

```
src/
├── types/
│   └── mpc.ts                          # Tipos e interfaces MPC
├── hooks/
│   └── useMPCDashboardData.ts          # Hook principal de dados e lógica
├── components/crm/
│   ├── MPCDashboard.tsx                # Container principal
│   └── mpc/
│       ├── MPCKPIStrip.tsx             # Resumo Executivo (6 KPIs)
│       ├── MPCAlertsFeed.tsx           # Alertas MPC (área crítica)
│       ├── MPCDentistPerformance.tsx   # Tabela de Dentistas
│       ├── MPCSectorHealth.tsx         # Cartões de Setores
│       ├── MPCWeeklyFocus.tsx          # Foco da Semana
│       └── MPCRecommendedDecisions.tsx # Decisões Recomendadas
├── pages/
│   ├── MPCDashboard.tsx                # Página autenticada (usa Firebase)
│   └── MPCDashboardDemo.tsx            # Página demo (pública, sem auth)
└── App.tsx                             # Rotas
```

---

## 🚀 Como Usar

### 1. **Modo Demo (Sem Autenticação)**
```
http://localhost:8080/mpc-demo
```
Acessa o painel com dados mockados. Perfeito para visualizar, testar e fazer demos.

### 2. **Modo Produção (Autenticado)**
```
http://localhost:8080/mpc-dashboard
```
Requer login com credenciais Firebase. Carrega dados reais do Firestore.

---

## 📊 Seções do Painel

### 1. **Resumo Executivo (KPI Strip)**
Exibe 6 indicadores principais em cards com:
- **Produção:** Pacientes atendidos vs. meta diária
- **Conversão:** Taxa de conversão agendados → atendidos
- **Comparecimento:** % de confirmados que compareceram
- **Satisfação:** Média de satisfação do cliente (0-5)
- **Receita:** Receita do dia vs. meta
- **Meta Geral:** Score agregado (0-100%)

Cada card mostra:
- Valor principal
- Meta
- Percentual atingido
- Barra de progresso
- Tendência (↑ ↓ →)

### 2. **Alertas MPC (Área Crítica)**
A parte mais importante do painel. Exibe apenas o que requer atenção.

Cada alerta possui:
- **Nível:** CRÍTICO, ALTO, MÉDIO, BAIXO
- **Título:** Descrição do problema
- **Provável Causa:** Análise de raiz
- **Impacto:** Estimativa financeira ou operacional
- **Ação Sugerida:** O que fazer
- **Botões:** "Adotar Ação" ou "Ignorar"

**Exemplo de Alerta:**
```
NÍVEL: CRÍTICO
TÍTULO: Receita do dia abaixo da meta
CAUSA: Combinação de baixa produção, conversão e comparecimento
IMPACTO: Deficit de R$ 5.000
AÇÃO: Revisar performance diária e executar ações corretivas
```

### 3. **Performance por Dentista**
Tabela elegante com:
- Nome
- Especialidade
- Meta / Realizado (e percentual)
- Taxa de Conversão (%)
- Satisfação (0-5)
- Sparkline (tendência 90 dias)
- Status (OK / Aviso / Crítico)

### 4. **Saúde dos Setores**
4 cartões (um para cada setor):
- **Recepção**
- **Clínica**
- **Ortodontia**
- **Comercial**

Cada cartão mostra:
- Score 0-5 com cor (verde → vermelho)
- Barra de progresso
- Top 2 problemas
- Botão "Ver Detalhes" (abre modal)

### 5. **Foco da Semana**
Lista priorizada (1-3 itens) com:
- Prioridade estratégica
- Rationale
- Owner (opcional)
- Botão "Editar Prioridades"

### 6. **Decisões Recomendadas**
Sugestões automáticas geradas pela análise MPC:
- Título descritivo
- Impacto (Alto / Médio / Baixo)
- Estimativa de resultado (ex: +R$ 5.000)
- Plano de ação (3-5 steps)
- Botões: "Executar Decisão" ou "Adiar"

---

## 🔧 Integração com Dados Reais

### Modelo de Dados Esperado

```typescript
interface MobileData {
  appointments: Array<{
    id: string;
    status: 'attended' | 'confirmed' | 'scheduled';
    scheduledAt: Date;
    confirmedAt?: Date;
    attendedAt?: Date;
    attendedBy?: string; // dentist ID
  }>;
  
  surveys: Array<{
    id: string;
    sector: 'reception' | 'clinic' | 'ortho' | 'sales';
    score: number; // 0-5
    createdAt: Date;
  }>;
  
  dentists: Array<{
    id: string;
    name: string;
    specialty: string;
    dailyTarget: number;
  }>;
  
  averageTicket: number; // em BRL
}
```

### Como Conectar ao Firebase/Firestore

No arquivo `useMPCDashboardData.ts`, substitua a função `getMockMPCData()` por uma chamada real:

```typescript
const queryFn = async () => {
  // Seu código aqui para buscar dados do Firestore/API
  const appointments = await db.collection('appointments').get();
  const surveys = await db.collection('surveys').get();
  const dentists = await db.collection('dentists').get();
  
  return {
    appointments: appointments.docs.map(doc => doc.data()),
    surveys: surveys.docs.map(doc => doc.data()),
    dentists: dentists.docs.map(doc => doc.data()),
    averageTicket: 500,
  };
};
```

---

## 🎨 Design & UX

### Princípios Aplicados

1. **Hierarquia Visual Extrema**
   - Alertas críticos em topo
   - Cards grandes para KPIs
   - Menos abas, mais síntese

2. **Cores Estratégicas**
   - 🟢 Verde: Tudo OK (≥85%)
   - 🟡 Amarelo: Atenção (60-85%)
   - 🔴 Vermelho: Crítico (<60%)

3. **Tipografia**
   - Headlines grandes (28-36px) para KPIs
   - Texto mínimo
   - Máximo 30 palavras por seção

4. **Espaçamento**
   - Grid 6-coluna para KPIs
   - 8px de padding/margin padrão
   - Cards com sombra discreta

---

## 🔄 Fluxo de Dados

```
[Firestore/API]
        ↓
[useMPCDashboardData hook]
        ↓
[calculateMetrics] → MPCMetrics
[generateAlerts]   → MPCAlert[]
[calculateDentistPerformance] → DentistPerformance[]
[calculateSectorHealth] → SectorHealth[]
[generateWeeklyFocus] → WeeklyFocus[]
[generateRecommendedDecisions] → RecommendedDecision[]
        ↓
[MPCDashboard component]
        ↓
[Sub-components render]
        ↓
[UI rendered]
```

---

## 🧪 Testes

### Teste de Interatividade
1. Clique em um alerta para expandir/colapsar
2. Clique em "Ver Detalhes" em um setor para abrir modal
3. Verifique se os dados são renderizados corretamente

### Teste de Responsividade
- Desktop: 7 colunas
- Tablet: 3 colunas
- Mobile: 1 coluna

---

## 📈 Próximos Passos (Roadmap)

- [ ] Integrar com dados reais do Firestore
- [ ] Adicionar filtros por período (7/30/90 dias)
- [ ] Implementar gráficos de tendência (sparklines melhorados)
- [ ] Adicionar export de relatórios (PDF/Excel)
- [ ] Notificações em tempo real para alertas críticos
- [ ] Histórico de decisões tomadas
- [ ] Machine Learning para prever tendências
- [ ] Comparação com períodos anteriores
- [ ] Drill-down detalhado para cada métrica
- [ ] Sugestões de ações com probabilidade de sucesso

---

## 📝 Exemplos de Alertas MPC

### ✅ Alerta bem formado
```
NÍVEL: MÉDIO
TÍTULO: Taxa de no-show alta (25%)
CAUSA: Confirmações inefetivas ou falha no lembrete
IMPACTO: Receita em risco: R$ 3.500
AÇÃO: Implementar confirmação 24h antes e WhatsApp com vídeo/mapas
```

### ❌ Alerta mal formado
```
TÍTULO: Problema geral
CAUSA: Algo não está certo
IMPACTO: Impacto negativo
AÇÃO: Melhorar tudo
```

---

## 🔒 Segurança & Permissões

- Dados sensíveis (nomes de pacientes) são mascarados
- Apenas agregados aparecem no painel
- Auditoria registra quem confirmou/alterou dados
- Role-based access control via `useUserPermissions`

---

## 📞 Suporte

Para dúvidas sobre:
- **Integração de dados:** Verificar `useMPCDashboardData.ts`
- **Componentes:** Verificar `src/components/crm/mpc/`
- **Tipos:** Verificar `src/types/mpc.ts`

---

## Changelog

### v0.1.0 (2026-07-01)
- ✨ Initial release
- 📊 6 KPIs principais
- 🚨 Sistema de alertas MPC
- 👥 Performance por dentista
- 🏥 Saúde dos setores
- 📋 Foco da semana
- 💡 Decisões recomendadas automáticas
