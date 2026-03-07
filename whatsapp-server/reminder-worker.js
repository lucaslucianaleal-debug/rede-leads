import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

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

// MODO DE SEGURANÇA: REPORT-ONLY (sem envios automáticos)
// O worker NUNCA envia mensagens, apenas atualiza a lista de lembretes na UI
const MY_PHONE = '17991040452';
const REPORT_ONLY_MODE = true; // ⚠️ SEMPRE true - sem envios automáticos
const COOLDOWN_MINUTES = 60; // 1 hora
const BACKEND_URL = 'http://localhost:3001'; // URL do backend (porta do servidor Express/WhatsApp)
const NEXT_SENDS_FILE = resolve(__dirname, 'next-sends.json');
const SEND_FAILURES_FILE = resolve(__dirname, 'send-failures.json');

// Templates de lembrete personalizados por tempo
function generateReminderText(dataAgendamento, type) {
  switch(type) {
    case '24h':
    case '12h':
      return `⏰ Lembrete da sua avaliação | OdontoCompany Olimpia\n\nOlá! Passando só pra lembrar que sua avaliação está marcada para amanhã. 😊\n\n📅 Data e Horário: ${dataAgendamento}\n\nQualquer imprevisto me avise por aqui. Te esperamos! 💚`;
    
    case '3h':
      return `⏰ Faltam 3 horas para sua avaliação!\n\nOlá, tudo bem? Sua consulta na OdontoCompany Olimpia está chegando. 😄\n\n📅 Data e Horário: ${dataAgendamento}\n\nEstamos te esperando! 💚`;
    
    case '1h':
      return `⏰ Falta apenas 1 hora para sua avaliação!\n\nOlá, tudo bem? Já estamos deixando tudo pronto para te receber na OdontoCompany Olimpia. 😄\n\n📅 Data e Horário: ${dataAgendamento}\n\nAté logo! 💚`;
    
    default:
      return `⏰ Lembrete da sua avaliação | OdontoCompany Olimpia\n\n📅 Data e Horário: ${dataAgendamento}\n\nTe esperamos! 💚`;
  }
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
// slotType: '24h'|'12h'|'3h'|'1h'
// slotTime: Date correspondente ao horário programado
async function shouldSend(lead, slotType, slotTime, now) {
  // Trava 1: Telefone válido?
  const normalized = normalizePhone(lead.telefone);
  if (normalized.length < 10 || normalized.length > 13) {
    console.log(
      `[reminder-worker] 🚫 ${lead.nome}: telefone inválido (${normalized.length} dígitos, precisa 10-13)`
    );
    return false;
  }

  // Trava 2: É o meu próprio número?
  if (normalized.endsWith(MY_PHONE) || normalized === MY_PHONE) {
    console.log(`[reminder-worker] 🚫 ${lead.nome}: é o meu próprio número (MY_PHONE)`);
    return false;
  }

  // Trava 3: Ja foi enviado neste slot?
  if (lead.lembretes?.sent?.[slotType]) {
    console.log(`[reminder-worker] ⏭️  ${lead.nome} (${slotType}): já foi enviado em ${lead.lembretes.sent[slotType]}`);
    return false;
  }

  // Trava 4: Agora é >= horário programado?
  if (now < slotTime) {
    // Ainda não é hora
    return false;
  }

  // Trava 5: Cooldown de 1h (última mensagem do vendedor)?
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
        telefone: phoneId,
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

// Salvar próximos envios para exibição na UI
function saveNextSends(nextSends) {
  try {
    fs.writeFileSync(NEXT_SENDS_FILE, JSON.stringify(nextSends, null, 2));
    console.log(`[reminder-worker] 📝 Próximos envios salvos (${nextSends.length} agendados)`);
  } catch (e) {
    console.error(`[reminder-worker] ⚠️  Erro ao salvar próximos envios:`, e.message);
  }
}

// Registrar tentativa falhada
function recordFailedAttempt(leadId, slot, error) {
  try {
    let failures = {};
    if (fs.existsSync(SEND_FAILURES_FILE)) {
      failures = JSON.parse(fs.readFileSync(SEND_FAILURES_FILE, 'utf8'));
    }

    const key = `${leadId}:${slot}`;
    if (!failures[key]) {
      failures[key] = {
        leadId,
        slot,
        attempts: 0,
        lastError: null,
        firstFailedAt: new Date().toISOString(),
        lastFailedAt: null
      };
    }

    failures[key].attempts += 1;
    failures[key].lastError = error;
    failures[key].lastFailedAt = new Date().toISOString();

    fs.writeFileSync(SEND_FAILURES_FILE, JSON.stringify(failures, null, 2));
  } catch (e) {
    console.error(`[reminder-worker] ⚠️  Erro ao registrar falha:`, e.message);
  }
}

// Limpar registro de falha quando sucesso
function clearFailedAttempt(leadId, slot) {
  try {
    if (!fs.existsSync(SEND_FAILURES_FILE)) return;
    
    let failures = JSON.parse(fs.readFileSync(SEND_FAILURES_FILE, 'utf8'));
    const key = `${leadId}:${slot}`;
    delete failures[key];
    
    fs.writeFileSync(SEND_FAILURES_FILE, JSON.stringify(failures, null, 2));
  } catch (e) {
    console.error(`[reminder-worker] ⚠️  Erro ao limpar falha:`, e.message);
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
    
    // Para calcular próximos envios
    const nextSends = [];

    for (const lead of leads) {
      if (!lead.dataAgendamento) continue;

      // Ignorar leads com automação desativada
      if (lead.lembretes?.disabled === true) {
        console.log(`[reminder-worker] 🚫 ${lead.nome}: automação desativada (lembretes.disabled = true), ignorando`);
        continue;
      }

      checked++;
      const appointmentDate = parseAppointment(lead.dataAgendamento);
      if (!appointmentDate) continue;

      // Computar slots de envio
      const slots = computeSlots(appointmentDate);

      // Para cada slot, verificar se deve enviar
      for (const [slotType, slotTime] of Object.entries(slots)) {
        // Calcular se foi enviado e se está agendado para o futuro
        const isAlreadySent = lead.lembretes?.sent?.[slotType];
        const isFutureSlot = now < slotTime;
        
        if (!isAlreadySent && isFutureSlot) {
          // Adicionar à lista de próximos envios
          nextSends.push({
            leadId: lead.id,
            leadName: lead.nome,
            telefone: lead.telefone,
            servicoProcurado: lead.servicoProcurado,
            slot: slotType,
            scheduledFor: slotTime.toISOString(),
            appointmentDate: lead.dataAgendamento
          });
        }

        if (!(await shouldSend(lead, slotType, slotTime, now))) continue;

        eligible++;

        // Montar mensagem
        const reminderText = generateReminderText(lead.dataAgendamento, slotType);
        const normalized = normalizePhone(lead.telefone);
        const phoneId = normalized.length >= 11 ? normalized.slice(-11) : normalized;

        // REPORT-ONLY: Apenas registra que o lembrete está pronto, nÃO envia
        console.log(`[reminder-worker] 📄 REPORT: Lembrete ${slotType} pronto para ENVIO MANUAL para ${lead.nome} (${phoneId})`);
        console.log(`[reminder-worker]    Mensagem: "${reminderText.split('\n')[0]}..."`);
        console.log(`[reminder-worker]    Clique no botão na UI para enviar manualmente`);
        // NÃO marca, NÃO envia, apenas lista
      }
    }

    // Salvar próximos envios
    saveNextSends(nextSends);

    console.log(
      `[reminder-worker] ✅ Rodada concluída: ${checked} leads com agendamento, ${eligible} lembretes ${DRY_RUN ? '(DRY RUN)' : 'enviados'}, ${nextSends.length} agendados`
    );
  } catch (error) {
    console.error('[reminder-worker] ❌ Erro:', error.message);
  }
}

// ⚠️ REMINDER-WORKER DESATIVADO COMPLETAMENTE
// 🔐 O sistema agora é 100% MANUAL
// Todos os lembretes são enviados manualmente via UI
// O worker não roda em background

console.log(`
╔════════════════════════════════════════════════╗
║  🔒 SISTEMA DESATIVADO - MODO 100% MANUAL      ║
║                                                ║
║  ✓ Automação: DESLIGADA                        ║
║  ✓ Worker: NÃO RODANDO                         ║
║  ✓ Lembretes: APENAS MANUAIS (via UI)          ║
║  ✓ Segurança: MÁXIMA                           ║
║                                                ║
║  Use a interface para enviar lembretes         ║
╚════════════════════════════════════════════════╝
`);

// Encerrá imediatamente
process.exit(0);
