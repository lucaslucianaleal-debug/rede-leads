# 🔔 Automação de Lembretes de Agendamento

Este diretório contém os scripts para automação de lembretes (24h, 12h, 3h, 1h antes do agendamento).

## 📋 Visão Geral

- **migrate-add-sent-lembretes.js** - Adiciona o objeto `lembretes.sent` aos 458 leads (one-time)
- **reminder-worker.js** - Worker que roda a cada 5 minutos e envia lembretes (long-running)

## 🔒 Travaças de Segurança Implementadas

1. **Dry Run Mode** (padrão) - Apenas imprime no console o que faria, sem enviar WhatsApp real
2. **Cooldown de 1h** - Não envia se a última mensagem do vendedor foi há menos de 1 hora
3. **Trava de Telefone** - Nunca envia para:
   - MY_PHONE = '17991040452' (seu próprio número)
   - Telefones com menos de 10 dígitos ou mais de 12 dígitos

## 📊 Cálculo de Janelas (exemplo prático)

Se o agendamento é para **07/03/2026 09:00** (amanhã):

- **24h antes** = 06/03/2026 09:00 ← enviar amanhã de manhã
- **12h antes** = 06/03/2026 21:00 ← enviar hoje à noite
- **3h antes** = 07/03/2026 06:00 ← enviar amanhã bem cedo
- **1h antes** = 07/03/2026 08:00 ← enviar faltando 1h

O sistema verifica cada 5 minutos se `now >= slotTime`, e se sim + passou nas travas, envia.

## 🚀 Como Usar

### Passo 1: Rodar a Migração (DRY RUN - sem modificar nada)

```bash
cd whatsapp-server
node migrate-add-sent-lembretes.js
```

**Esperado:** Script imprime lista de todos os 458 leads e mostra quantos vão receber `lembretes.sent`.

Exemplo de output:
```
[migrate-add-sent-lembretes] DRY RUN
[migrate-add-sent-lembretes] 📊 Total de leads: 458
[migrate-add-sent-lembretes] 🔄 Leads que precisam de migrate: 458

[migrate-add-sent-lembretes] ✅ José Carlos (17992633297) - lembretes.sent criado
[migrate-add-sent-lembretes] ✅ Tiago (17987654321) - lembretes.sent criado
...
[migrate-add-sent-lembretes] 🔒 DRY RUN: Nenhuma alteração no Firebase.
Se estiver satisfeito, execute com: node migrate-add-sent-lembretes.js --apply
```

### Passo 2: APLICAR a Migração (com --apply)

Se o output do Passo 1 estiver correto, execute:

```bash
node migrate-add-sent-lembretes.js --apply
```

**Resultado:** Todos os 458 leads agora têm:
```javascript
lembretes: {
  h24: false,
  today: false,
  sent: {
    "24h": null,
    "12h": null,
    "3h": null,
    "1h": null
  }
}
```

### Passo 3: Testar o Worker (DRY RUN)

```bash
node reminder-worker.js
```

**Esperado:** Script roda UMA VEZ, mostra o que faria (sem enviar WhatsApp), e encerra.

Exemplo de output:
```
[reminder-worker] 🚀 Iniciando worker (DRY RUN: true)
[reminder-worker] Rodará a cada 5 minutos. Pressione Ctrl+C para parar.

[reminder-worker] ⏰ Rodada: 2026-03-06T15:30:00.123Z
[reminder-worker] 🔮 DRY RUN: Enviaria lembrete 24h para José Carlos (17992633297)
[reminder-worker]    Mensagem: "Olá!..."
[reminder-worker]    Conversa ID: 17992633297
[reminder-worker] 💾 José Carlos: lembretes.sent[24h] marcado como enviado
[reminder-worker] ✅ Rodada concluída: 10 leads com agendamento, 2 lembretes (DRY RUN)
```

### Passo 4: Rodar o Worker em PRODUÇÃO (long-running)

```bash
node reminder-worker.js --send
```

**Comportamento:**
- Roda continuamente, a cada 5 minutos
- Envia lembretes reais via WhatsApp (respeitando cooldown + travas)
- Marca cada lembrete em `lembretes.sent[slot]` com timestamp ISO
- Nunca repete o mesmo lembrete (idempotência garantida)
- Pressione **Ctrl+C** para parar

## 📝 Estrutura de Dados Resultante

Cada lead terá este formato após migração + primeiro_send:

```javascript
{
  id: "lead_abc123",
  nome: "José Carlos",
  telefone: "17 99263-3297",
  dataAgendamento: "07/03/2026 09:00",
  lembretes: {
    h24: false,           // flag manual (compatível com CalendarView)
    today: false,         // flag manual (compatível com CalendarView)
    sent: {
      "24h": "2026-03-06T09:00:00.000Z",   // null ou timestamps ISO
      "12h": "2026-03-06T21:00:00.000Z",
      "3h": null,                          // ainda não é hora
      "1h": null                           // ainda não é hora
    }
  }
}
```

## 🔧 Integração com index.js (próxima etapa)

Quando estiver pronto para enviar WhatsApp real, o reminder-worker.js vai:
1. Montar a mensagem com `generateReminderText(dataAgendamento, slotType)`
2. Chamar a função interna `sendMessage()` do WhatsApp client (já conectado em `index.js`)
3. Atualizar `lembretes.sent[slot]` em tempo real

## 🛡️ Checklist de Segurança

- [ ] Migração rodou com DRY RUN e parecer ok?
- [ ] Aplicou com --apply?
- [ ] Worker testou com DRY RUN e mostrou lembretes corretos?
- [ ] Verificou se o cooldown de 1h está funcionando?
- [ ] Verificou se MY_PHONE não aparece nos logs?
- [ ] Deixou rodando com --send?

## 📊 Monitoramento

Enquanto o worker roda em produção:

```bash
# Em outro terminal, monitore a quantidade de lembretes enviados:
tail -f output.log | grep "Rodada concluída"
```

Exemplo:
```
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 3 lembretes enviados
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 0 lembretes enviados
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 2 lembretes enviados
```

## 🚨 Troubleshooting

### "crm_data/shared não encontrado"
- Verifique se o Firestore está conectado (log do `index.js` deve dizer "[ready]")

### "Cooldown ativo (última msg há Xmin...)"
- Esperado! Significa que você enviou uma mensagem para este lead faz pouco tempo
- Aguarde 1 hora antes de enviar outro lembrete

### "telefone inválido (X dígitos...)"
- O lead tem um número com formato ruim (muito curto ou muito longo)
- Valide o `lead.telefone` no CRM

---

✅ **Pronto para começar? Copie e cole o comando abaixo no terminal:**

```bash
cd "c:\CRM ODC - REDE NT\whatsapp-server" && node migrate-add-sent-lembretes.js
```
