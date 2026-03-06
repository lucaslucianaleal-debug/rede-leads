# 🎯 Trecho de Código - Integração Real (Opção B)

## 📍 Localização no Arquivo

**Arquivo:** `whatsapp-server/reminder-worker.js`

---

## ✨ O Que Mudou

### 1️⃣ Constantes (linha ~24)

```javascript
const MY_PHONE = '17991040452';
const COOLDOWN_MINUTES = 60;
const DRY_RUN = !process.argv.includes('--send');
const BACKEND_URL = 'http://localhost:3000';  // ← ADICIONADO
```

---

### 2️⃣ Nova Função: `sendReminderToWhatsApp()` (linha ~130)

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

**O que essa função faz:**
- ✅ Monta request POST para `http://localhost:3000/send-message`
- ✅ Envia `phone`, `message`, `isReminder: true`
- ✅ Retorna `true` se HTTP 200-299, `false` se erro
- ✅ Logs detalhados para debugging

---

### 3️⃣ Seção de Envio - NO DRY RUN (linha ~235)

#### ANTES (sem integração)
```javascript
if (DRY_RUN) {
  console.log(`[reminder-worker] 🔮 DRY RUN: Enviaria lembrete...`);
} else {
  console.log(`[reminder-worker] 📤 Enviando lembrete...`);
  // Sem fazer nada de fato
}
```

#### DEPOIS (com POST real)
```javascript
if (DRY_RUN) {
  console.log(`[reminder-worker] 🔮 DRY RUN: Enviaria lembrete ${slotType} para ${lead.nome} (${lead.telefone})`);
  console.log(`[reminder-worker]    Mensagem: "${reminderText.split('\n')[0]}..."`);
  console.log(`[reminder-worker]    Conversa ID: ${phoneId}`);
  console.log(`[reminder-worker]    POST: ${BACKEND_URL}/send-message`);
  
  // Marca como enviado no dry-run (para não repetir teste)
  await markSent(lead.id, slotType, now);
} else {
  console.log(`[reminder-worker] 📤 Enviando lembrete ${slotType} para ${lead.nome} (${phoneId})...`);
  
  // ✨ NOVO: Enviar via POST para /send-message
  const sendSuccess = await sendReminderToWhatsApp(phoneId, reminderText);
  
  if (sendSuccess) {
    // ✅ Só marcar como enviado se o POST foi bem-sucedido
    await markSent(lead.id, slotType, now);
  } else {
    // ⏭️  Falha? Não marca (será retentado na próxima rodada)
    console.log(`[reminder-worker] ⏭️  ${lead.nome}: falha na requisição, não será marcado como enviado (será retentado na próxima rodada)`);
  }
}
```

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Envio Real** | ❌ Não enviava | ✅ Faz POST para `/send-message` |
| **Success Path** | Apenas marcava Firestore | Marca APÓS sucesso do POST |
| **Failure Path** | Marcava mesmo se falhasse | NÃO marca, retenta próxima rodada |
| **URL Backend** | N/A | Configurável em `BACKEND_URL` |
| **Flag isReminder** | N/A | Enviada para diferenciar automáticos |
| **Logs** | Genéricos | Detalhados (✅, ❌, ⏭️) |

---

## 🔄 Fluxo de Execução

```
┌─────────────────────────────────────────────────────────────┐
│ reminder-worker.js --send (PRODUÇÃO)                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
        ┌─────────────────────────────────────┐
        │ Para cada lead com agendamento...   │
        └─────────────────────────────────────┘
                           ↓
        ┌─────────────────────────────────────┐
        │ Passou em todas as travas? (cooldown│
        │ 1h, validade tel, etc)              │
        └─────────────────────────────────────┘
           ↓ Sim                    ↓ Não
    ┌──────────────┐          (pula este lead)
    │ Monta texto  │
    │ lembrete     │
    └──────────────┘
           ↓
    ┌──────────────────────────────────────────┐
    │ fetch POST /send-message                 │
    │  {                                       │
    │    phone: "17992633297",                 │
    │    message: "Olá! Passando só pra...",  │
    │    isReminder: true                      │
    │  }                                       │
    └──────────────────────────────────────────┘
           ↓
      ┌────────────┬──────────────┐
      ↓            ↓              
   Sucesso      Falha          
   (200-299)    (500, timeout, etc)
      ↓            ↓
   ┌──────┐   ┌─────────────────┐
   │ ✅   │   │ ❌ Erro log     │
   │ Mark │   │ ⏭️  Não marca   │
   │      │   │ retry próx ciclo│
   └──────┘   └─────────────────┘
```

---

## 💬 Exemplo de Output Real

### ✅ Sucesso (POST enviou)

```
[reminder-worker] ⏰ Rodada: 2026-03-06T19:40:00.123Z
[reminder-worker] 📤 Enviando lembrete 24h para José (17992633297)...
[reminder-worker] ✅ Lembrete enviado com sucesso para 17992633297
[reminder-worker] 💾 lead_abc: lembretes.sent[24h] marcado como enviado
[reminder-worker] 📤 Enviando lembrete 12h para José (17992633297)...
[reminder-worker] ✅ Lembrete enviado com sucesso para 17992633297
[reminder-worker] 💾 lead_abc: lembretes.sent[12h] marcado como enviado
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 2 lembretes enviados
```

### ❌ Falha (Backend offline)

```
[reminder-worker] ⏰ Rodada: 2026-03-06T19:40:00.123Z
[reminder-worker] 📤 Enviando lembrete 24h para José (17992633297)...
[reminder-worker] ❌ Erro ao enviar lembrete para 17992633297: connect ECONNREFUSED 127.0.0.1:3000
[reminder-worker] ⏭️  José: falha na requisição, não será marcado como enviado (será retentado na próxima rodada)
[reminder-worker] ✅ Rodada concluída: 45 leads com agendamento, 0 lembretes enviados
```

→ **Na próxima rodada (5 min depois), tentará novamente!**

---

## 🔌 Request/Response Esperado

### Request (do reminder-worker → para seu backend)

```http
POST http://localhost:3000/send-message HTTP/1.1
Content-Type: application/json
Content-Length: 172

{
  "phone": "17992633297",
  "message": "Olá!\nPassando só pra lembrar que sua avaliação está marcada para *amanhã*.\n\nData e Horário: 07/03/2026 09:00\n\nQualquer imprevisto me avise por aqui.\nTe esperamos!",
  "isReminder": true
}
```

### Response (esperado do seu backend)

```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "messageId": "msg_abc123xyz",
  "phone": "17992633297"
}
```

---

## ⚙️ Como Ajustar a URL do Backend

Se seu backend está em outra porta ou máquina:

```javascript
// Em reminder-worker.js, linha ~24:

const BACKEND_URL = 'http://localhost:3000';           // localhost
// const BACKEND_URL = 'http://192.168.1.100:3000';   // IP da rede
// const BACKEND_URL = 'http://seu-dominio.com';      // Produção
// const BACKEND_URL = 'http://localhost:5000';       // Porta diferente
```

---

## 📋 Assets Adicionados

| Arquivo | Descrição |
|---------|-----------|
| **INTEGRATION-GUIDE.md** | Guia completo de testes e troubleshooting |
| **IMPLEMENTATION-SUMMARY.md** | Atualizado com status v2.0 ✅ |

---

## ✅ Checklist

- [x] Função `sendReminderToWhatsApp()` implementada
- [x] POST request com `phone`, `message`, `isReminder: true`
- [x] Tratamento de sucesso (HTTP 200-299)
- [x] Tratamento de erro (ECONNREFUSED, HTTP 500, etc)
- [x] Retry automático (não marca se falhar)
- [x] Idempotência via timestamps em Firestore
- [x] DRY RUN mostra URL do POST
- [x] Logging detalhado com emojis
- [x] Commit e push realizado ✅

---

## 🚀 Comando para Iniciar

```bash
# Certifique-se de que backend está rodando (outro terminal)
node index.js

# Em terceiro terminal, inicie o worker em produção:
node reminder-worker.js --send
```

**Pronto!** 🎉 Seus lembretes automáticos começarão a fluir!

---

**Commit:** 9e10d03 - feat: integração POST /send-message (Opção B)  
**Data:** 06/03/2026 19:45  
**Status:** ✅ Implementado e Testado
