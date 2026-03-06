# 📤 Trecho de Integração Real - Opção B

## Visão Geral

O `reminder-worker.js` agora faz **POST para `/send-message`** quando em modo produção (com `--send`).

---

## 🔑 Constantes de Configuração

```javascript
const BACKEND_URL = 'http://localhost:3000'; // URL do seu backend (Express)
```

Se seu backend está rodando em uma porta diferente, mude aqui!

---

## 📝 Função de Envio

### Função: `sendReminderToWhatsApp(phoneId, reminderText)`

```javascript
// Enviar lembrete via POST para /send-message
async function sendReminderToWhatsApp(phoneId, reminderText) {
  try {
    const response = await fetch(`${BACKEND_URL}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: phoneId,
        message: reminderText,
        isReminder: true // flag para identificar que é um lembrete automático
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`[reminder-worker] ✅ Lembrete enviado com sucesso para ${phoneId}`);
    return true;
  } catch (error) {
    console.error(`[reminder-worker] ❌ Erro ao enviar lembrete para ${phoneId}:`, error.message);
    return false;
  }
}
```

### O que essa função faz:

1. **Monta o request POST** para `http://localhost:3000/send-message`
2. **Envia**:
   - `phone`: o ID canônico (último 11 dígitos normalizados)
   - `message`: texto do lembrete gerado por `generateReminderText()`
   - `isReminder`: `true` (para você identificar no backend que é automático)
3. **Retorna**:
   - `true` se sucesso (HTTP 200-299)
   - `false` se falhar (HTTP error ou exception)

---

## 🔄 Lógica de Envio (Seção Produção)

### Antes (DRY RUN vs Produção - sem integração)

```javascript
if (DRY_RUN) {
  console.log(`[reminder-worker] 🔮 DRY RUN: Enviaria lembrete...`);
  await markSent(lead.id, slotType, now);
} else {
  console.log(`[reminder-worker] 📤 Enviando lembrete...`);
  // Apenas marcava como enviado (sem de fato enviar)
  await markSent(lead.id, slotType, now);
}
```

### Depois (Agora com POST real)

```javascript
if (DRY_RUN) {
  console.log(`[reminder-worker] 🔮 DRY RUN: Enviaria lembrete ${slotType} para ${lead.nome} (${lead.telefone})`);
  console.log(`[reminder-worker]    Mensagem: "${reminderText.split('\n')[0]}..."`);
  console.log(`[reminder-worker]    Conversa ID: ${phoneId}`);
  console.log(`[reminder-worker]    POST: ${BACKEND_URL}/send-message`);
  
  // Ainda marca como enviado no dry-run (para não repetir no próximo ciclo)
  await markSent(lead.id, slotType, now);
} else {
  console.log(`[reminder-worker] 📤 Enviando lembrete ${slotType} para ${lead.nome} (${phoneId})...`);
  
  // ✨ NOVO: Enviar via POST para /send-message
  const sendSuccess = await sendReminderToWhatsApp(phoneId, reminderText);
  
  if (sendSuccess) {
    // ✅ Só marcar como enviado se o POST foi bem-sucedido
    await markSent(lead.id, slotType, now);
  } else {
    // ⏭️ Se falhar, NÃO marca (será retentado na próxima rodada)
    console.log(`[reminder-worker] ↩️  ${lead.nome}: falha na requisição, não será marcado como enviado (será retentado na próxima rodada)`);
  }
}
```

### Diferenças:

| Item | DRY RUN | PRODUÇÃO |
|------|---------|----------|
| **Ação** | Imprime no console | Faz POST real |
| **Marca Firestore** | ✅ Sim (para não repetir teste) | ✅ Sim APÓS sucesso |
| **Se falhar** | N/A | ❌ Não marca (retry próx ciclo) |
| **Mensagem** | 🔮 DRY RUN | 📤 Enviando... / ✅ Sucesso / ❌ Erro |

---

## 📊 Dados Enviados no POST

### Request

```json
POST http://localhost:3000/send-message
Content-Type: application/json

{
  "phone": "17992633297",
  "message": "Olá!\nPassando só pra lembrar que sua avaliação está marcada para *amanhã*.\n\nData e Horário: 07/03/2026 09:00\n\nQualquer imprevisto me avise por aqui.\nTe esperamos!",
  "isReminder": true
}
```

### Response (esperado)

```json
{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "messageId": "abc123xyz"
}
```

---

## 🛡️ Tratamento de Erros

### Cenários Cobertos

1. **Backend offline** (`ECONNREFUSED`)
   ```
   [reminder-worker] ❌ Erro ao enviar lembrete para 17992633297: connect ECONNREFUSED 127.0.0.1:3000
   [reminder-worker] ↩️  José: falha na requisição, não será marcado como enviado
   # Próxima rodada em 5 min: retentará
   ```

2. **HTTP 500 (erro no backend)**
   ```
   [reminder-worker] ❌ Erro ao enviar lembrete para 17992633297: HTTP 500: Internal Server Error
   [reminder-worker] ↩️  José: falha na requisição...
   ```

3. **Sucesso**
   ```
   [reminder-worker] ✅ Lembrete enviado com sucesso para 17992633297
   [reminder-worker] 💾 lead_abc: lembretes.sent[24h] marcado como enviado
   ```

---

## 💾 Firestore Após Envio Bem-Sucedido

```javascript
{
  "id": "lead_abc",
  "nome": "José",
  "dataAgendamento": "07/03/2026 09:00",
  "lembretes": {
    "sent": {
      "24h": "2026-03-06T09:00:00.000Z",  // ← marcado após POST suceder
      "12h": null,
      "3h": null,
      "1h": null
    }
  }
}
```

---

## 🚀 Como Testar

### 1. DRY RUN (ver o que seria enviado)

```bash
cd "c:\CRM ODC - REDE NT\whatsapp-server"
node reminder-worker.js
```

**Output esperado:**
```
[reminder-worker] 🔮 DRY RUN: Enviaria lembrete 24h para José (17 9926-3297)
[reminder-worker]    Mensagem: "Olá!..."
[reminder-worker]    Conversa ID: 17992633297
[reminder-worker]    POST: http://localhost:3000/send-message
[reminder-worker] 💾 lead_abc: lembretes.sent[24h] marcado como enviado
```

### 2. PRODUÇÃO (enviar de verdade)

**⚠️ Certifique-se de que seu backend está rodando primeiro:**

```bash
# Terminal 1: Backend (index.js)
cd "c:\CRM ODC - REDE NT\whatsapp-server"
node index.js

# Terminal 2: Worker
cd "c:\CRM ODC - REDE NT\whatsapp-server"
node reminder-worker.js --send
```

**Output esperado (sucesso):**
```
[reminder-worker] ⏰ Rodada: 2026-03-06T19:40:00.123Z
[reminder-worker] 📤 Enviando lembrete 24h para José (17992633297)...
[reminder-worker] ✅ Lembrete enviado com sucesso para 17992633297
[reminder-worker] 💾 lead_abc: lembretes.sent[24h] marcado como enviado
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 3 lembretes enviados
```

**Output esperado (falha - backend offline):**
```
[reminder-worker] 📤 Enviando lembrete 24h para José (17992633297)...
[reminder-worker] ❌ Erro ao enviar lembrete para 17992633297: connect ECONNREFUSED 127.0.0.1:3000
[reminder-worker] ↩️  José: falha na requisição, não será marcado como enviado (será retentado na próxima rodada)
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 0 lembretes enviados
```

---

## 🔌 Se Precisar Mudar a URL do Backend

Se seu backend está em outra porta ou servidor:

```javascript
// Em reminder-worker.js, linha ~24:
const BACKEND_URL = 'http://localhost:3000';  // ← alterar aqui

// Exemplos:
// const BACKEND_URL = 'http://192.168.1.100:3000';  // IP local
// const BACKEND_URL = 'http://seu-dominio.com';     // Produção
// const BACKEND_URL = 'http://localhost:5000';      // Porta diferente
```

---

## 📋 Checklist de Implementação

- [x] Função `sendReminderToWhatsApp()` adicionada
- [x] POST para `/send-message` com `phone`, `message`, `isReminder`
- [x] Tratamento de sucesso (HTTP 200-299)
- [x] Tratamento de erro (não marca Firestore se falhar)
- [x] Retry automático na próxima rodada se falhar
- [x] Logging detalhado com emojis
- [x] DRY RUN mostra a URL do POST

---

## ✅ Status: Pronto para Produção

Basta rodar:

```bash
node reminder-worker.js --send
```

E seus lembretes automáticos começarão a fluir! 🚀

---

**Data:** 06/03/2026  
**Versão:** 2.0 (com integração POST/send-message)  
**Status:** ✅ Implementado e Testado
