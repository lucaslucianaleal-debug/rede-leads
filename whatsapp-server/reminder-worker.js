import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccountKey = JSON.parse(
  (await import('fs')).readFileSync(resolve(__dirname, 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  databaseURL: 'https://rede-crm-default-rtdb.firebaseio.com'
});

const db = admin.firestore();

// Constantes de segurança
const MY_PHONE = '17991040452';
const COOLDOWN_MINUTES = 60; // 1 hora
const DRY_RUN = !process.argv.includes('--send');
const BACKEND_URL = 'http://localhost:3000'; // URL do backend (porta do servidor Express)

// Templates de lembrete (iguais ao whatsapp.ts)
function generateReminderText(dataAgendamento, type) {
  const timeLabel = type === '24h' ? 'amanhã' : 'HOJE';
  return `Olá!\nPassando só pra lembrar que sua avaliação está marcada para *${timeLabel}*.\n\nData e Horário: ${dataAgendamento}\n\nQualquer imprevisto me avise por aqui.\nTe esperamos!`;
}

// Parse "dd/MM/yyyy HH:mm" → Date
function parseAppointment(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour = 0, minute = 0] = (timePart || '00:00').split(':').map(Number);
    
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  } catch (e) {
    return null;
  }
}

// Calcular os horários de envio para cada slot
function computeSlots(appointmentDate) {
  return {
    '24h': new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000),
    '12h': new Date(appointmentDate.getTime() - 12 * 60 * 60 * 1000),
    '3h': new Date(appointmentDate.getTime() - 3 * 60 * 60 * 1000),
    '1h': new Date(appointmentDate.getTime() - 60 * 60 * 1000),
  };
}

// Normalizar telefone: remove tudo que não é dígito
function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

// Obter a última mensagem enviada pelo bot para este lead (cooldown check)
async function getLastBotMessageTime(phoneId) {
  try {
    const messagesRef = db.collection('conversations')
      .doc(phoneId)
      .collection('messages')
      .where('fromMe', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(1);
    
    const snap = await messagesRef.get();
    if (snap.empty) return null;
    
    const msg = snap.docs[0].data();
    return msg.timestamp instanceof admin.firestore.Timestamp
      ? msg.timestamp.toDate()
      : new Date(msg.timestamp);
  } catch (e) {
    console.log(`[reminder-worker] ⚠️  Erro ao buscar última mensagem de ${phoneId}:`, e.message);
    return null;
  }
}

// Verificar se devemos enviar (passa em todas as travas)
async function shouldSend(lead, slot, now) {
  // Trava 1: Telefone válido?
  const normalized = normalizePhone(lead.telefone);
  if (normalized.length < 10 || normalized.length > 12) {
    console.log(
      `[reminder-worker] 🚫 ${lead.nome}: telefone inválido (${normalized.length} dígitos, precisa 10-12)`
    );
    return false;
  }

  // Trava 2: É o meu próprio número?
  if (normalized.endsWith(MY_PHONE) || normalized === MY_PHONE) {
    console.log(`[reminder-worker] 🚫 ${lead.nome}: é o meu próprio número (MY_PHONE)`);
    return false;
  }

  // Trava 3: Ja foi enviado neste slot?
  if (lead.lembretes?.sent?.[slot]) {
    console.log(`[reminder-worker] ⏭️  ${lead.nome} (${slot}): já foi enviado em ${lead.lembretes.sent[slot]}`);
    return false;
  }

  // Trava 4: Agora é >= horário programado?
  if (now < slot) {
    return false; // Ainda não é hora
  }

  // Trava 5: Cooldown de 1h (última mensagem do vendedor)?
  // Usar última 11 dígitos como ID da conversa (canonical)
  const phoneId = normalized.length >= 11 ? normalized.slice(-11) : normalized;
  const lastBotMsg = await getLastBotMessageTime(phoneId);
  
  if (lastBotMsg) {
    const minutesSinceLast = (now.getTime() - lastBotMsg.getTime()) / (1000 * 60);
    if (minutesSinceLast < COOLDOWN_MINUTES) {
      console.log(
        `[reminder-worker] ⏳ ${lead.nome}: cooldown ativo (última msg há ${Math.round(minutesSinceLast)}min, precisa ${COOLDOWN_MINUTES}min)`
      );
      return false;
    }
  }

  return true;
}

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

// Marcar como enviado
async function markSent(leadId, slot, timestamp) {
  try {
    const docRef = db.collection('crm_data').doc('shared');
    const docSnap = await docRef.get();
    const data = docSnap.data();
    const leads = data?.leads || [];

    const updatedLeads = leads.map(l => {
      if (l.id === leadId) {
        return {
          ...l,
          lembretes: {
            ...l.lembretes,
            sent: {
              ...(l.lembretes?.sent || {}),
              [slot]: timestamp.toISOString()
            }
          }
        };
      }
      return l;
    });

    await docRef.set({
      leads: updatedLeads,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    console.log(`[reminder-worker] 💾 ${leadId}: lembretes.sent[${slot}] marcado como enviado`);
  } catch (e) {
    console.error(`[reminder-worker] ❌ Erro ao marcar enviado:`, e.message);
  }
}

// Main worker loop
async function runReminder() {
  const now = new Date();
  const isoNow = now.toISOString();
  
  try {
    console.log(`\n[reminder-worker] ⏰ Rodada: ${isoNow}`);

    const docRef = db.collection('crm_data').doc('shared');
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log('[reminder-worker] ⚠️  crm_data/shared não encontrado');
      return;
    }

    const data = docSnap.data();
    const leads = data?.leads || [];
    let checked = 0;
    let eligible = 0;

    for (const lead of leads) {
      if (!lead.dataAgendamento) continue;

      checked++;
      const appointmentDate = parseAppointment(lead.dataAgendamento);
      if (!appointmentDate) continue;

      // Computar slots de envio
      const slots = computeSlots(appointmentDate);

      // Para cada slot, verificar se deve enviar
      for (const [slotType, slotTime] of Object.entries(slots)) {
        if (!(await shouldSend(lead, slotType, now))) continue;

        eligible++;

        // Montar mensagem
        const reminderText = generateReminderText(lead.dataAgendamento, slotType);
        const normalized = normalizePhone(lead.telefone);
        const phoneId = normalized.length >= 11 ? normalized.slice(-11) : normalized;

        if (DRY_RUN) {
          console.log(`[reminder-worker] 🔮 DRY RUN: Enviaria lembrete ${slotType} para ${lead.nome} (${lead.telefone})`);
          console.log(`[reminder-worker]    Mensagem: "${reminderText.split('\n')[0]}..."`);
          console.log(`[reminder-worker]    Conversa ID: ${phoneId}`);
          console.log(`[reminder-worker]    POST: ${BACKEND_URL}/send-message`);
          
          // Ainda marca como enviado no dry-run (para não repetir no próximo ciclo)
          await markSent(lead.id, slotType, now);
        } else {
          console.log(`[reminder-worker] 📤 Enviando lembrete ${slotType} para ${lead.nome} (${phoneId})...`);
          
          // Enviar via POST para /send-message
          const sendSuccess = await sendReminderToWhatsApp(phoneId, reminderText);
          
          if (sendSuccess) {
            // Só marcar como enviado se o POST foi bem-sucedido
            await markSent(lead.id, slotType, now);
          } else {
            console.log(`[reminder-worker] ⏭️  ${lead.nome}: falha na requisição, não será marcado como enviado (será retentado na próxima rodada)`);
          }
        }
      }
    }

    console.log(
      `[reminder-worker] ✅ Rodada concluída: ${checked} leads com agendamento, ${eligible} lembretes ${DRY_RUN ? '(DRY RUN)' : 'enviados'}`
    );
  } catch (error) {
    console.error('[reminder-worker] ❌ Erro:', error.message);
  }
}

// Iniciar worker
console.log(`[reminder-worker] 🚀 Iniciando worker (DRY RUN: ${DRY_RUN})`);
console.log(`[reminder-worker] Rodará a cada 5 minutos. Pressione Ctrl+C para parar.\n`);

// Rodar imediatamente
await runReminder();

// Rodar a cada 5 minutos
setInterval(runReminder, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[reminder-worker] ⛔ Encerrando...');
  process.exit(0);
});
