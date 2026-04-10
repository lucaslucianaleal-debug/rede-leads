# ANÁLISE DE AUDITORIA — REDE LEADS CRM

**Data:** 1º de abril de 2026  
**Escopo:** App CRM de conversão de leads, built com React + Vite + TypeScript + Firebase + WhatsApp Integration  
**Status:** Em produção

---

## 1. FLUXOS PRINCIPAIS

### 1.1 Criação de Leads

**Situação Atual:**
- ✅ **Fluxo:** Dialog (`CreateLeadDialog`) com campos obrigatórios: nome, telefone, etapa inicial ("Novo")
- ✅ **Validação:** Nome e telefone obrigatórios; mínimo 10 dígitos de telefone
- ✅ **Formatação:** Preserva múltiplos formatos (com/sem DDD, com/sem país)
- ✅ **Criação automática de ligação:** Após criar lead, abre modal de CallLog
- ✅ **Sincronização:** Salvo em Firebase + localStorage com debounce de 1.5s

| Campo | Obrigatório | Validação |
|-------|-------------|-----------|
| Nome | ✅ Sim | Não vazio |
| Telefone | ✅ Sim | ≥10 dígitos |
| Serviço procurado | ❌ Não | Free text |
| Fonte Lead | ✅ Sim (default "Outro") | Select (Online, Google, Sorteio Radio, Site, Indicação, Influenciadora, Hotleads) |
| Etapa | ✅ Sim (default "Novo") | 18 etapas possíveis |
| Data Criação | ✅ Auto (hoje) | dd/MM/yyyy |

**Possíveis Problemas:**
- ⚠️ Sem validação de telefone duplicado no CREATE (apenas exibe duplicatas após criação)
- ⚠️ Sem transação: lead salvo localmente antes de confirmar no Firebase
- ⚠️ Débito do localstorage pode perder dados se falhar

**Sugestões de Melhoria:**
1. Fazer validação de duplicatas PRÉ-criação com feedback em tempo real
2. Usar transação Firestore + fallback em localStorage
3. Adicionar dedupe automático com merge de histórico

---

### 1.2 Edição de Leads

**Situação Atual:**
- ✅ **Dialog (`EditLeadDialog`):** Permite editar todos os campos
- ✅ **Agendamento integrado:** Picker de data + hora com suporte a reagendamento
- ✅ **Rastreamento de agendamento:** Dois campos de auditoria:
  - `dataAgendamentoCriado`: quando o agendamento foi CRIADO (dd/MM/yyyy)
  - `dataAgendamentoAlterado`: quando foi ALTERADO (reagendamento) (dd/MM/yyyy)
- ✅ **Mudança de telefone:** Migra conversa do WhatsApp para novo número
- ✅ **Soft-delete:** Não deleta, apenas marca com `_deleted: true`

**Fluxo de Mudança de Telefone:**
```
Phone Change Detection → Copy conversation to new phone ID
                      → Copy all messages (chunks de 400)
                      → Delete old messages + old conversation doc
                      → Record lastWriter metadata (uid + timestamp + UA)
```

**Possíveis Problemas:**
- ⚠️ Mudança de telefone é assíncrona → pode ter race condition se múltiplas edições simultâneas
- ⚠️ Sem rollback se falhar migração de conversa
- ⚠️ `dataAgendamentoAlterado` registra QUANDO, mas não registra QUEM alterou

**Sugestões de Melhoria:**
1. Mutex local para evitar múltiplas edições simultâneas
2. Log de auditoria: alterações antigas (changelog)
3. Registrar user ID em `dataAgendamentoAlterado` ou campo novo

---

### 1.3 Delete de Leads

**Situação Atual:**
- ✅ **Soft-Delete:** Marca lead com `_deleted: true` (não remove fisicamente)
- ✅ **Filtros:** Lideads deletados não aparecem em filas/relatórios (`filter(l => !l._deleted)`)
- ✅ **Permissão:** Apenas `admin` e `editor` podem deletar (roles: admin/editor/viewer/recepcao)
- ✅ **Metadata:** Registra `deletedAt` e `deletedBy` para auditoria

**Fluxo:**
```
User clicks Delete → Select multiple leads → Confirm dialog
                  → Mark _deleted: true + deletedAt + deletedBy
                  → Update Firebase (merge, não remove docs)
```

**Possíveis Problemas:**
- ⚠️ Soft-delete acumula dados (nunca remove): banco cresce sem limite
- ⚠️ Sem interface para restaurar deletados
- ⚠️ Sem limpeza periódica ou backup de datosapostolados
- ⚠️ `deletedBy` é string (uid), não há retirada de dados sensíveis

**Sugestões de Melhoria:**
1. Implementar hard-delete após X dias (política de retenção)
2. Backup automático antes de hard-delete
3. Interface de "lixeira" com opção de restaurar
4. Criptografar `lastWriter.uid` em docs deletados

---

### 1.4 Follow-Ups

**Situação Atual:**
- ✅ **Modal de Follow-Up:** Registra observação + opção de mudar etapa + botão rápido "Desistiu"
- ✅ **Lead Stages:** 18 etapas (Novo → Em contato → Follow-Up 1-12 → Avaliação agendada/Fora da região/Desistência/Finalizado)
- ✅ **Contador:** `followUpCount` incrementa a cada follow-up
- ✅ **Data de seguição:** Campo `dataFollowUp` (data do próximo follow-up agendado)
- ✅ **Data de execução:** Campo `lastFollowUpDone` registra quando foi de fato feito
- ✅ **WhatsApp:** Integração: "Enviar WhatsApp" dentro do follow-up via `WhatsAppMessageDialog`

**Fluxo:**
```
Lead em follow-up vence (dataFollowUp <= hoje)
                      → Aparece em [Follow-Up Queue]
                      → User clica "Registrar Follow-Up"
                      → Escreve obs + etapa + clica "Enviar WhatsApp"
                      → lastFollowUpDone = hoje
                      → followUpCount++
```

**Possíveis Problemas:**
- ⚠️ Sem limite de follow-ups (pode ficar em Follow-Up 12 indefinidamente)
- ⚠️ `dataFollowUp` não tem validação: pode ser data no passado
- ⚠️ Sem escalação automática de etapa (ex: após 5 follow-ups → Desistência)
- ⚠️ Campo `lastFollowUpDone` é TEXT (dd/MM/yyyy), não timestamp → difícil calcular tempo entre contatos

**Sugestões de Melhoria:**
1. Regra de escalação: Follow-Up 12 → auto-mudança etapa se X dias
2. Mudar `lastFollowUpDone` para Timestamp ISO
3. Alertas: "Este lead não teve follow-up por X dias"
4. Dashboard: Taxa de follow-ups completados vs agendados

---

### 1.5 Agendamentos

**Situação Atual:**
- ✅ **Modal `AgendamentoDialog`:** Picker de data + hora
- ✅ **Armazenamento:** Campo `dataAgendamento` = "dd/MM/yyyy HH:mm"
- ✅ **Criação:** `dataAgendamentoCriado` registra quando foi criado
- ✅ **Alteração:** `dataAgendamentoAlterado` registra quando foi alterado
- ✅ **Confirmação:** Automática via WhatsApp com briefing para recepção
- ✅ **Abas:** [Agenda do Dia] mostra slots por hora para hoje + filas de Call Return

**Fluxo:**
```
Lead → Agendar atendimento [AgendamentoDialog]
    → Escolhe data (picker) + hora (09:00)
    → Salva: dataAgendamento = "dd/MM/yyyy 09:00"
           + dataAgendamentoCriado = hoje se novo
    → Dispara confirmação WhatsApp (com briefingRecepcao)
    → Aparece em [Agenda do Dia]
```

**Possíveis Problemas:**
- ⚠️ Sem validação de horário duplicado (2 clientes agendados 09:00)
- ⚠️ Sem capacidade de clínica: "máximo 5 agendamentos por hora"
- ⚠️ Campo `briefingRecepcao` é optional e nem sempre preenchido
- ⚠️ Sem automação de lembrete pré-consulta (ex: 24h antes)

**Sugestões de Melhoria:**
1. Implementar agenda visual com ocupação por hora
2. Automação: 24h antes → enviar WhatsApp "confirme sua consulta"
3. Reagendamento automático se cliente não confirma
4. Campo `briefingRecepcao` obrigatório ou com template

---

### 1.6 Chamadas Telefônicas

**Situação Atual:**
- ✅ **Modal `CallLogDialog`:** Registra resultado da ligação + obs + agendamento retorno
- ✅ **Resultados:** Atendeu | Caixa de mensagem | Não atendeu | Número errado
- ✅ **Dados:** `dataRetornoLigacao` = data agendada para ligar novamente
- ✅ **Status:** Pode atualizar status da ligação (Quente/Morno/Frio)
- ✅ **Etapa:** Pode mudar etapa do lead

**Fluxo:**
```
Lead → Abrir [Call Log Dialog]
    → Escreve result (ex: "Atendeu")
    → Preenche obs: "Falou sobre implante"
    → (Opcional) Marca "Agendar retorno" + data
    → Salva: dataRetornoLigacao = "dd/MM/yyyy"
    → Lead aparece em [Call Return Queue] se retorno agendado
```

**Possíveis Problemas:**
- ⚠️ Campo `dataRetornoLigacao` é TEXT, não timestamp → difícil ordenar/filtrar
- ⚠️ Sem gravação de chamada (apenas log manual)
- ⚠️ Sem integração com sistema de telefonia (VoIP/PBX)
- ⚠️ Sem roteamento inteligente: "qual agente deve ligar?"

**Sugestões de Melhoria:**
1. Integração com API de telefonia (Twilio/Zendesk)
2. Recording automático (com consentimento)
3. Mudar `dataRetornoLigacao` para Timestamp
4. Roteamento: atribuir lead ao agente com menos calls

---

### 1.7 Mensagens WhatsApp

**Situação Atual:**
- ✅ **Modal `WhatsAppMessageDialog`:** Composição de mensagem + envio
- ✅ **Integração:** Servidor Node.js externo (`whatsapp-server/index.js`) com WhatsApp Web.js
- ✅ **Autenticação:** QR code login via `WhatsAppQRModal`
- ✅ **Mensagens sugeridas:** Template por etapa (follow-up messages)
- ✅ **Vouchers:** Opção de incluir voucher em PDF na mensagem
- ✅ **Status de servidor:** Badge "🟢 Connected" vs "🔴 Desconectado"
- ✅ **Confirmação:** Atualiza status/etapa do lead após envio

**Fluxo:**
```
Lead → Click "Enviar WhatsApp"
    → Modal abre com template sugerido
    → User edita mensagem
    → (Opcional) Inclui voucher: busca no Firestore
    → Click "Enviar"
    → Hace chamada POST ao whatsapp-server
    → Servidor envia via WhatsApp Web
    → Registra em Firestore: conversation/messages/{id}
    → Lead: status/etapa atualiza, `lastFollowUpDone = hoje`
```

**Possíveis Problemas:**
- ⚠️ **CRÍTICO:** Servidor WhatsApp é Node.js NOT serverless → requer manutenção manual
- ⚠️ Sem rate limiting: pode ser bloqueado pelo WhatsApp (spam)
- ⚠️ QR code expira: usuário pode perca acesso sem avisar
- ⚠️ Sem retry automático se mensagem falhar
- ⚠️ Conversas armazenadas em Firestore (custos crescem)
- ⚠️ Sem encriptação de mensagens (Firestore rules = open)

**Sugestões de Melhoria:**
1. Usar WhatsApp Cloud API (Meta) em vez de Web.js
2. Implementar exponential backoff + retry para falhas
3. Alertas: QR code vencido, servidor offline
4. Rate limit: máximo 3 msgs/min por lead
5. Política de retenção: deletar msgs após 90 dias

---

## 2. INTERFACES DE USUÁRIO

### 2.1 Abas/Seções Principais

**Estrutura de Tabs (`Index.tsx`):**

| Aba | Componente | Funções |
|-----|-----------|---------|
| **Dashboard** | StatsCards + PerformanceChart | KPIs: Totais, Quentes, Mornos, Frios, Agendados, Follow-ups pendentes, Comparecimentos |
| **Agenda do Dia** | AgendaDoDia | Slots horários com leads agendados (hoje) |
| **Follow-Ups** | FollowUpQueue | Filas de leads com seguição vencida |
| **Retorno de Ligações** | CallReturnQueue | Leads com ligação agendada |
| **Lembretes** | ReminderQueue | Leads com alertas 24h/today ativas |
| **Calendar** | CalendarView | Visualização mensal dos agendamentos |
| **Todos os Leads** | AllLeadsView + LeadTable | Tabela com filtros (etapa, status, resposta, busca, fonte, comparecimento) |
| **Chat** | ChatView | Histórico de conversas WhatsApp por contato |
| **Admin** | AdminPanel | Gestão de usuários (CRUD), papéis |

**Total:** ~8 abas principais

### 2.2 Diálogos/Modais Importantes

| Modal | Trigger | Funções |
|-------|---------|---------|
| **CreateLeadDialog** | Botão "+ Novo Lead" | Criar novo lead com todos os campos |
| **EditLeadDialog** | Click em lead na tabela | Editar todos os campos + agendamento |
| **LeadDetailsDialog** | Click em "Detalhes" | View-only lead details |
| **FollowUpDialog** | Click em lead em Follow-Up Queue | Registrar seguição + mudar etapa |
| **CallLogDialog** | Click em qualquer lead | Registrar resultado da ligação |
| **AgendamentoDialog** | Click em "Agendar" | Picker de data/hora |
| **WhatsAppMessageDialog** | Click em "Enviar WhatsApp" | Composição + envio de mensagem |
| **WhatsAppQRModal** | Auto-trigger se desconectado | QR code para re-autenticar |
| **AlertDialog** (Delete) | Click em "Deletar" | Confirmação => soft-delete |
| **AlertDialog** (Clear Duplicates) | Click em "Limpar Duplicatas" | Confirmação => merge de duplicatas |

**Total:** ~10 diálogos principais

### 2.3 Fluxo Visual de Lead (Zero → Conversão)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. NOVO LEAD                                                      │
│    └─ Criar via [+ Novo Lead] ou importar CSV                   │
│       Etapa: "Novo" | Status: "" | Telefone obrigatório         │
└─────┬───────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. PRIMEIRO CONTATO                                               │
│    └─ [Call Log Dialog]: Registrar ligação                      │
│       Resultado: Atendeu/Caixa/Não atendeu/Erro                 │
│       Etapa → "Em contato"                                       │
│       Status → QUENTE/MORNO/FRIO                                 │
└─────┬───────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. FOLLOW-UPS (1-12)                                              │
│    └─ Lead vence em [Follow-Up Queue]                           │
│       Click [Registrar Follow-Up]:                              │
│         - Escreve observação                                    │
│         - (Opcional) Enviar WhatsApp                            │
│         - Incrementa etapa (Follow-Up 1 → 2 → ... → 12)        │
│       Etapa → "Follow-Up N"                                      │
│       lastFollowUpDone = hoje                                    │
└─────┬───────────────────────────────────────────────────────────┘
      │
      ├─────────────────────────────────────────────────────────┐
      │                                                           │
      ▼                                                           ▼
┌──────────────────────────┐                        ┌───────────────────────────┐
│ 4a. LEAD QUENTE/MORNO    │                        │ 4b. LEAD ABANDONADO       │
│     └─ Agendar consulta  │                        │     └─ Follow-Up 12       │
│        [Agendamento D]    │                        │        Etapa:"Desistência"│
│        dataAgendamento    │                        │        Remover de filas   │
│        dataAgendamento    │                        │        Criado: xxx        │
│        Criado             │                        │        Sem retorno >X dias│
│        Etapa: "Avaliação  │                        └───────────────────────────┘
│        agendada"          │
└─────┬────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────┐
│ 5. AGENDA DO DIA                                 │
│    └─ [AgendaDoDia]: Visualizar slots por hora  │
│       Confirmar comparecimento                  │
│       Briefing para recepção                    │
└─────┬────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────┐
│ 6. COMPARECIMENTO                                │
│    └─ Mark Attendance: COMPARECEU / NÃO         │
│       Etapa: "Finalizado" (se COMPARECEU)       │
│       Status: "" (limpa status temp)            │
└──────────────────────────────────────────────────┘
```

---

## 3. DADOS E VALIDAÇÃO

### 3.1 Estrutura de Dados (Interface Lead)

```typescript
interface Lead {
  id: string;                          // Telefone normalizado (10 dígitos: DDNNNNNNNNN)
  dataCriacao: string;                 // dd/MM/yyyy (OBRIGATÓRIO)
  dataContato: string;                 // dd/MM/yyyy
  nome: string;                        // (OBRIGATÓRIO)
  telefone: string;                    // Múltiplos formatos aceitos
  servicoProcurado: string;            // Free text
  captador: string;                    // Quem captou?
  fonteLead: string;                   // Online|Google|Sorteio Radio|Site|Indicação|Influenciadora|Hotleads|Outro
  etapaLead: LeadStage;               // Enum: Novo|Em contato|Follow-Up 1-12|...|Finalizado
  status: LeadStatus;                 // QUENTE|MORNO|FRIO|""
  respostaLead: LeadResposta;         // RESPONDEU|NÃO RESPONDEU|""
  comparecimento: LeadComparecimento; // COMPARECEU|NÃO COMPARECEU|AGUARDANDO DATA|""
  dataFollowUp: string;               // dd/MM/yyyy (próximo follow-up agendado)
  lastFollowUpDone?: string;          // dd/MM/yyyy (quando foi de fato feito)
  dataAgendamentoCriado?: string;     // dd/MM/yyyy (quando criou agendamento)
  dataAgendamentoAlterado?: string;   // dd/MM/yyyy (quando reagendou)
  dataAgendamento: string;            // dd/MM/yyyy HH:mm
  dataRetornoLigacao: string;         // dd/MM/yyyy (próxima ligação)
  observacao: string;                 // Notas livres
  briefingRecepcao?: string;          // Briefing para recepção (exibido em Agenda do Dia)
  followUpCount: number;              // Contador de follow-ups realizados
  lembretes: ReminderStatus;          // { h24: bool, today: bool, disabled?: bool, sent?: {...} }
  // Campos adicionados por soft-delete:
  _deleted?: boolean;                 // Soft delete flag
  deletedAt?: string;                 // ISO timestamp
  deletedBy?: string;                 // User ID
  // Campos de auditoria (attachLastWriter):
  lastWriter?: {
    uid: string | null;
    ts: string; // ISO timestamp
    ua: string; // User Agent
  }
}
```

### 3.2 Validações Implementadas

| Campo | Validação | Feedback |
|-------|-----------|----------|
| **nome** | Não vazio (`trim()`) | Toast: "Nome é obrigatório" |
| **telefone** | ≥10 dígitos (`\D/g` cleanup) | Toast: "Telefone inválido (mínimo 10 dígitos)" |
| **etapaLead** | Enum (18 valores) | Select dropdown |
| **status** | Enum (QUENTE/MORNO/FRIO) | Radio buttons |
| **dataAgendamento** | Date parser (dd/MM/yyyy) | Failover para vazio se inválido |
| **fonteLead** | Normalização: "instagram" → "Online" | Auto-mapping em `normalizeFonteLead()` |
| **dataCriacao** | Fallback: dataContato ou hoje | `ensureDateCriacao()` |

### 3.3 Detecção de Duplicatas

**Situação Atual:**
- ✅ **AutoDetec:**  `AllLeadsView.tsx` agrupa leads pelo telefone normalizado (`replace(/[^0-9]/g, "")`)
- ✅ **UI:** Marca leads duplicados em vermelho/amarelo com ⚠️ icon
- ✅ **Ação:** Botão [Limpar Duplicatas] → `clearDuplicates()` → mantém mais recente, deleta resto

**Fluxo:**
```javascript
duplicatePhones = new Map<phone, Lead[]>()
leads.forEach(lead => {
  const cleanPhone = lead.telefone.replace(/\D/g, "")
  if (duplicatePhones.get(cleanPhone).length > 1) {
    lead._deleted = true  // Soft-delete older ones
  }
})
```

**Possíveis Problemas:**
- ⚠️ **CRÍTICO:** Zero proteção PRÉ-inserção → permite duplicatas
- ⚠️ Sem merge automático de histórico (ignora conversas do lead deletado)
- ⚠️ `clearDuplicates()` usa ID para sorting "mais recente", mas ID = telefone → não há timestamp
- ⚠️ Sem opção de MANTER ambos (ex: pai + filho com mesmo celular)

**Sugestões de Melhoria:**
1. **Index único** em Firebase: `leads/{phone}` só 1 doc por telefone
2. **Merge automático** de conversas WhatsApp ao deletar
3. **Histórico de contatos**: campo `contactsHistory: {name, date}[]` se reutiliza telefone
4. **Detection em real-time**: input field mostra "Telefone já existe: João Silva (3 dias atrás)"

---

### 3.4 Campos Obrigatórios vs Opcionais

| Campo | Obrigatório | Default | Cleanup |
|-------|-------------|---------|---------|
| nome | ✅ | N/A | Trim |
| telefone | ✅ | N/A | `normalizePhoneTo10Digits()` |
| dataCriacao | ✅ | hoje | dd/MM/yyyy |
| status | ❌ | "" | Empty string if not set |
| respostaLead | ❌ | "" | Empty if not set |
| comparecimento | ❌ | "" | Empty if not set |
| dataFollowUp | ✅ | hoje (default) | dd/MM/yyyy |
| dataAgendamento | ❌ | "" | Empty if no appt |
| observacao | ❌ | "" | Free text |

### 3.5 Validação de Telefone

**Normalização Implementada:**

```typescript
// Input: 55 17 99116-4762 | (17) 99116-4762 | 1799116-4762
// Output: 17991164762 (10 dígitos, remove DDD se aparenta ser móvel)

normalizePhoneTo10Digits(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  let d = digits
  
  // Remove country code (55)
  if (d.startsWith("55")) d = d.slice(2)
  
  // Remove extra leading '9' for mobile numbers (11 → 10 dígitos)
  if (d.length === 11 && d[2] === '9') {
    return d.slice(0, 2) + d.slice(3)  // DDN... (10 dígitos)
  }
  
  // Already 10 dígits
  if (d.length === 10) return d
  
  // Fallback: take last 10
  if (d.length > 10) return d.slice(-10)
  
  return "" // Invalid
}

// Formatação para exibição:
// 17991164762 → (17) 99116-4762
formatPhoneNumber(phone: string): string {
  const cleaned = normalizePhoneTo10Digits(phone)
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  }
  return phone // Fallback
}
```

**Possíveis Problemas:**
- ⚠️ Sem validação de DDD brasileiro válido (17 = Araraquara, OK; 99 = inválido)
- ⚠️ Sem validação de padrão móvel vs fixo confiável
- ⚠️ Não detecta números fake ou centrais telefônicas

**Sugestões:**
1. Usar biblioteca `google-libphonenumber` para validação robusta
2. Alertar: "Esse número parece ser fixo" se aplicável
3. Regex para DDD brasileiros válidos (11-99)

---

## 4. PERFORMANCE E UX

### 4.1 Carregamentos

**Situação Atual:**
- ✅ **Inicial:** Mock leads + localStorage cache enquanto Firebase carrega (< 1s usuário vê algo)
- ✅ **Real-time:** `onSnapshot` listener = atualização ao vivo sem refresh
- ✅ **Debounce:** Saves to Firebase a cada 1.5s (não a cada keystroke)

**Performance Observações:**
- ⚠️ Sem paginação: Carrega TODOS os leads em memória
- ⚠️ Se tiver 10k leads, re-render é lento (atualizar filters trava UI)
- ⚠️ localStorage salva array inteiro (limite ~5MB no Chrome → ~1000 leads)

**Tempos de Resposta (estimado):**
- Criar lead: ~100ms (local) + 500ms (Firebase)
- Editar lead: ~50ms (local) + 500ms (Firebase)
- Deletar (soft): ~50ms (local) + 500ms (Firebase)
- Carregar página: 500ms (mock) + 1s (Firebase)
- Enviar WhatsApp: ~2s (rede) + processamento servidor

### 4.2 Paginação

**Situação Atual:**
❌ **NÃO EXISTE**
- App carrega todos os leads na memória
- Tabela (`LeadTable`) não tem scroll infinito ou paginação
- Filtros têm useMemo otimizações mas para 10k+ leads é lento

**Acesso:**
```typescript
const filteredLeads = useMemo(() => {
  let result = leads;
  if (filters.etapa !== "Todas") result = result.filter(...)
  if (filters.status !== "Todos") result = result.filter(...)
  // ... mais 5-10 filtros
  return result  // Retorna array INTEIRO
}, [leads, filters])
```

**Problema:** Lead table exibe 100% leads sem limite

**Sugestões:**
1. Implementar "virtual scrolling" com TanStack `@tanstack/react-virtual`
2. Cursor-based pagination no Firebase (limit + startAfter)
3. Lazy-load: 50 leads iniciais + "Ver mais"

### 4.3 Filtros

**Situação Atual:**
- ✅ **Filtros Dinâmicos em `AllLeadsView`:**
  - Etapa (dropdown)
  - Status (QUENTE/MORNO/FRIO)
  - Resposta (RESPONDEU/NÃO RESPONDEU)
  - Busca (search box)
  - Fonte (dropdown gerado dinamicamente)
  - Comparecimento (dropdown)
  - Período (date range picker)

**Performance:**
- ✅ Filtros não fazem query no Firebase (in-memory)
- ✅ useMemo previne recálculo desnecessário
- ⚠️ Mas se houver 10k leads, mesmo com useMemo é lento

**Sugestões:**
1. Pré-computar agregações (counters por etapa, status)
2. Elasticsearch ou Algolia para busca full-text rápida
3. Índices no Firebase (compound index em etapa + status)

### 4.4 Relatórios/Exportações

**Situação Atual:**
- ✅ **Exportações implementadas:**
  - CSV diário: todos leads criados hoje
  - CSV agendamentos: por data
  - XLSX semanal (ExcelJS): resumo de agendamentos + comparecimentos
  - XLSX relatório diário: resumo de atendimentos
  - XLSX relatório semanal: comparecimentos
  - Range report: período customizado

**Fluxo:**
```typescript
Export → Filter leads → Format as array
      → Papa.unparse (CSV) ou ExcelJS.writeBuffer (XLSX)
      → Blob → Download (a.click())
```

**Performance:**
- ✅ Relatórios gerados no cliente (sem servidor)
- ⚠️ Mas se tiver 50k leads, Excel pode ficar lento (> 5s)
- ⚠️ Sem progress bar: user não sabe o que está acontecendo

**Sugestões:**
1. Worker thread para geração de relatório (não trava UI)
2. Progress bar + ETA
3. Exportar para Google Sheets em vez de arquivo

---

## 5. SEGURANÇA E PERMISSÕES

### 5.1 Autenticação

**Situação Atual:**
- ✅ **Firebase Auth:** Email/password via `signInWithEmailAndPassword`
- ✅ **Context API:** `AuthProvider` encapsula lógica de autenticação
- ✅ **Session Persistence:** Firebase Web SDK salva auto no localStorage
- ✅ **Clinic Selection:** User pode escolher clínica no login (admin) ou é atribuído (user)

**Fluxo:**
```
Landing page (não autenticado)
         ▼
[Login form]: Email + Password
         ▼
Firebase Auth.signInWithEmailAndPassword()
         ▼
Fetch user profile: users/{uid} (Firestore)
         ▼
Se role = admin:
   - Pode escolher qualquer clínica
   - currentClinic = selectedClinic ou perfil.clinicId
Se role = user/editor/recepcao:
   - Atribuído a clinicId único
   - Validação: clinicId em profile.clinics array
         ▼
Redirect → CRM Dashboard (Index.tsx)
```

**Possíveis Problemas:**
- ⚠️ **CRÍTICO:** Firestore rules são `allow read, write: if true` → qualquer pessoa pode ler/gravar TUDO
- ⚠️ Firebase API key **EXPOSTA** no código source (firebase.ts) → público no bundle
- ⚠️ Sem 2FA (two-factor authentication)
- ⚠️ Sem rate limiting no Firebase Auth (brute force possível)
- ⚠️ Session não expira: token Firebase dura 1 hora mas auto-refresh

### 5.2 Roles e Permissões

**Hierarquia de Roles:**

```
┌─────────────────────────────────────────────────────────────┐
│ Role            │ canView │ canEdit │ canImport │ canDelete │ canManageUsers │
├─────────────────┼─────────┼────────┼──────────┼────────┼────────────────┤
│ admin           │   ✅    │   ✅   │    ✅    │   ✅   │      ✅         │
│ editor          │   ✅    │   ✅   │    ✅    │   ❌   │      ❌         │
│ recepcao        │   ✅    │   ✅   │    ❌    │   ❌   │      ❌         │
│ viewer          │   ✅    │   ❌   │    ❌    │   ❌   │      ❌         │
│ (não logado)    │   ✅    │   ❌   │    ❌    │   ❌   │      ❌         │
└─────────────────────────────────────────────────────────────┘
```

**Enforcement:**
- ✅ Frontend: Botões/ações desabilitadas se sem permissão
- ❌ **CRÍTICO:** Backend: ZERO validação de role em Firebase rules
  - Apenas: `allow read, write: if true`
  - Deveria ser: `allow read, write: if request.auth != null && request.auth.uid == resource.data.ownerId`

### 5.3 Isolamento de Clínica

**Situação Atual:**
- ✅ **Conceito:** Cada clínica tem seu próprio "compartimento" de dados
  - Estrutura: `clinics/{clinicId}/shared/shared` (documento raiz com array leads)
- ✅ **Filtro no App:** `currentClinic` usado para resolver qual doc carregar
- ✅ **localStorage:** Chave inclui clinicId → `rede_leads_{uid}_{clinicId}`

**Fluxo de Isolamento:**
```typescript
const targetDoc = clinicId 
  ? doc(db, "clinics", clinicId, "shared", "shared")  // Per-clinic data
  : doc(db, "crm_data", "shared")                     // Shared/default data

onSnapshot(targetDoc, (snapshot) => {
  const leads = snapshot.data().leads
  setLeads(leads)
})
```

**Possíveis Problemas:**
- ⚠️ **CRÍTICO:** Sem validação no Firestore: user do clinic A pode ler clinic B se souber ID
- ⚠️ Sem validação em `saveLeadWithSync()`: function não checa se user está em clinicId
- ⚠️ Admin pode mudar `selectedClinic` arbitrariamente → acessa qualquer clínica
- ⚠️ localStorage expõe clinicId em plain text

**Sugestões:**
1. Firestore rules: `allow read: if clinicId in request.auth.clinics or admin`
2. Backend validation em todas as mutations
3. Audit log: quem acessou que clínica, quando
4. Criptografia de localStorage

### 5.4 Dados Sensíveis

**Dados Coletados:**
- ✅ Nome (PII)
- ✅ Telefone (PII)
- ✅ Serviço procurado (preferência)
- ✅ Observações (pode incluir dados de saúde: "alergia a amoxicilina")
- ✅ Mensagens WhatsApp (conversas privadas)

**Armazenamento:**
- ✅ Firestore (Google Cloud)
  - Encrypted in transit (HTTPS)
  - Data at rest encrypted by machine key (Google manages)
  - ❌ Sem field-level encryption
  
- ✅ localStorage (client browser)
  - ❌ Plain text, local file
  - ❌ Acessível a qualquer extensão/malware

- ✅ WhatsApp messages (conversations/{phone}/messages)
  - ❌ Sem criptografia (Firestore rules = open)

**Possíveis Problemas:**
- ⚠️ **CRÍTICO:** Sem criptografia field-level → Google + Firebase admins podem ler dados
- ⚠️ Sem anonimização de backups
- ⚠️ Sem política de direitos autorais (LGPD compliance)
- ⚠️ Sem GDPR: direito ao esquecimento (não há "hard delete", apenas soft delete)
- ⚠️ Conversas WhatsApp armazenadas indefinidamente

**Sugestões:**
1. Implementar criptografia field-level (Tink library)
2. GDPR/LGPD compliance: 
   - Política de retenção de dados: deletar após 2 anos
   - Direito de acesso: exportar dados do usuário
   - Direito ao esquecimento: hard delete com confirmação
3. Audit trail: quem acessou dados sensíveis
4. Pseudonimização: split name + phone em docs separados

### 5.5 Segurança do Servidor WhatsApp

**Situação Atual:**
- ✅ Servidor Node.js (`whatsapp-server/index.js`) com WhatsApp Web.js
- ✅ CORS habilitado (desenvolvimento)
- ✅ Validação básica: check se `sendMessage` chama com dados válidos

**Possíveis Problemas:**
- ⚠️ **CRÍTICO:** CORS permite requests de ANY origin (`origin: '*'`)
- ⚠️ Sem autenticação no servidor WhatsApp (endpoint aberto)
- ⚠️ Sem rate limiting: cliente pode spam requests
- ⚠️ QR code salva em disco no servidor (segurança?)
- ⚠️ Sem HTTPS (se em produção, deve usar SSL)
- ⚠️ WhatsApp Web.js não é suportado oficialmente por Meta

**Sugestões:**
1. Usar WhatsApp Cloud API (Meta) em vez de Web.js
2. CORS: whitelist domínios conhecidos
3. Authenticação: JWT token ou API key
4. Rate limiting: `express-rate-limit`
5. HTTPS + certificate pinning
6. Logar todos os erros + alertas de taxa de bloqueio do WhatsApp

---

## 6. PROBLEMAS CRÍTICOS RESUMIDOS

| # | Severidade | Problema | Componente | Impacto |
|---|-----------|----------|-----------|---------|
| 1 | 🔴 CRÍTICO | Firestore rules: `allow read, write: if true` | firestore.rules | **BREACH**: Qualquer pessoa pode ler/gravar todos dados |
| 2 | 🔴 CRÍTICO | Firebase API key exposta | firebase.ts | **BREACH**: Hacker pode fazer requests direto ao Firebase |
| 3 | 🔴 CRÍTICO | Sem validação de rol no backend | crmSync.ts | **PRIVILEGE ESCALATION**: User comum pode editar dados admin |
| 4 | 🔴 CRÍTICO | Sem isolamento de clínica no Firestore | useLeads.ts | **CROSS-CLINIC ACCESS**: User da clínica A lê dados da clínica B |
| 5 | 🟠 ALTO | Servidor WhatsApp sem autenticação | whatsapp-server/index.js | **ABUSE**: Qualquer pessoa envia mensagens WhatsApp |
| 6 | 🟠 ALTO | Sem criptografia field-level | firebase.ts | **GDPR**: Dados sensíveis legíveis para Google admins |
| 7 | 🟠 ALTO | Paginação não existe | AllLeadsView.tsx | **PERFORMANCE**: Carrega 10k+ leads = UI trava |
| 8 | 🟠 ALTO | Sem proteção PRÉ-criar duplicatas | CreateLeadDialog.tsx | **DATA QUALITY**: Duplicatas crescem indefinidamente |
| 9 | 🟡 MÉDIO | Sem 2FA no Auth | useAuth.tsx | **ACCOUNT TAKEOVER**: Força bruta no Firebase Auth |
| 10 | 🟡 MÉDIO | Soft-delete sem retenção | useLeads.ts | **STORAGE BLOAT**: Banco cresce sem limite |

---

## 7. RECOMENDAÇÕES IMPLEMENTAÇÃO

### **FASE 1: SEGURANÇA (Urgente - 2-4 semanas)**

#### 1.1 Firestore Rules (Máxima Prioridade)
```typescript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Authenticate user
    match /clinics/{clinicId}/shared/shared {
      allow read: if request.auth != null && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.clinicId == clinicId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
      );
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ["admin", "editor"];
    }
    
    // Default clinic data (backward compat)
    match /crm_data/shared {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }
    
    // User profiles
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow write: if request.auth.uid == uid && !request.resource.data.role; // Cannot escalate role
    }
  }
}
```

#### 1.2 Hide Firebase API Key
- Move config para variáveis de ambiente
- Use Google Cloud Identity Platform em vez de expo key
- Deploy com `.env` file (não em código)

#### 1.3 Backend Validation
- Adicionar Cloud Functions para validar mutations
- Check user.clinicId antes de salvar
- Log de auditoria: quem fez o quê, quando

### **FASE 2: UX & DATA QUALITY (4-6 semanas)**

#### 2.1 Paginação
- Implementar TanStack `@tanstack/react-query` com pagination
- Cursor-based queries no Firebase
- Virtual scroll com `react-window`

#### 2.2 Anti-Duplicação
- Unique constraint em Firebase (1 doc por phone)
- Merge automático de conversas WhatsApp ao consolidar
- Alerta real-time: "Telefone já existe"

#### 2.3 Retenção de Dados
- Política: deletar soft-deletes após 90 dias
- Cloud Scheduler job: `DELETE FROM leads WHERE _deleted AND deletedAt < 90d`
- Backup automático antes de hard-delete

### **FASE 3: COMPLIANCE (2-3 semanas)**

#### 3.1 GDPR/LGPD
- Direito de acesso: download dados do user
- Direito ao esquecimento: hard delete com password renewal
- Consent tracking: usuário aceitou TOS

#### 3.2 Audit Trail
- Log todas as mudanças em tabela `audit_logs`
- Quem (uid), o quê (action), quando (timestamp), clínica
- Retenção: 2 anos

#### 3.3 Documentação
- Privacy policy
- Terms of service
- Data processing addendum (DPA)

### **FASE 4: PERFORMANCE (3-4 semanas)**

#### 4.1 Relatórios
- Gerar lado servidor (Cloud Functions) em vez de cliente
- Usar BigQuery para analytics
- Cache resultados por 1 hora

#### 4.2 Elasticsearch
- Sync leads para Elasticsearch
- Busca full-text rápida
- Facets: etapa, status, fonte

---

## 8. CHECKLIST DE IMPLEMENTAÇÃO

- [ ] **Semana 1:** Firestore rules corretas
- [ ] **Semana 2:** Backend validation (Cloud Functions)
- [ ] **Semana 3:** Teste de segurança (penetration test)
- [ ] **Semana 4:** Anti-duplicação + real-time alerts
- [ ] **Semana 5:** Paginação no frontend
- [ ] **Semana 6:** Cloud Scheduler para data retention
- [ ] **Semana 7:** Audit trail + compliance docs
- [ ] **Semana 8:** Migration de dados: encrypt sensibles
- [ ] **Semana 9:** Teste de carga (10k+ leads)
- [ ] **Semana 10:** Relatórios vs servidor

---

## CONCLUSÃO

A app **REDE LEADS** é bem estruturada em termos de UX e funcionalidade, com boas integrações de Firebase + WhatsApp. **PORÉM**, há vulnerabilidades CRÍTICAS de segurança e dados que devem ser addressadas antes de qualquer escala de produção.

**Prioridade 1:** Firestore rules + backend validation  
**Prioridade 2:** Anti-duplicação + paginação  
**Prioridade 3:** Compliance (GDPR/LGPD)  

Timeline recomendada: **10 semanas** de work intenso para atingir padrão enterprise.
