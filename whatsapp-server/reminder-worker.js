import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import { attachLastWriter } from './lib/crmGuard.mjs';
import { sendTextMessage } from './services/zapi-client.js';
import { getClinicZApiConfig, normalizeForZApi } from './services/lead-triage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountKey = JSON.parse(
  fs.readFileSync(resolve(__dirname, 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

const db = admin.firestore();

const CLINIC_ID = process.env.REMINDER_CLINIC_ID || 'odontocompany-olimpia';
const BACKEND_URL = process.env.REMINDER_BACKEND_URL || 'http://127.0.0.1:3001';
const AUTOMATION_ENABLED = process.env.REMINDER_AUTOMATION_ENABLED !== 'false';
const INTERVAL_MS = Number(process.env.REMINDER_INTERVAL_MS || 60_000);
const START_DELAY_MS = Number(process.env.REMINDER_START_DELAY_MS || 15_000);
const COOLDOWN_MINUTES = Number(process.env.REMINDER_COOLDOWN_MINUTES || 60);
const MY_PHONE = process.env.REMINDER_BLOCKED_PHONE || '17991040452';

const NEXT_SENDS_FILE = resolve(__dirname, 'next-sends.json');
const SEND_FAILURES_FILE = resolve(__dirname, 'send-failures.json');
const SENT_LEDGER_FILE = resolve(__dirname, 'reminder-sent-ledger.json');

// Cada slot tem uma janela própria. Se o servidor ficar offline e a janela passar,
// aquele slot é descartado em vez de ser enviado atrasado junto com os próximos.
const SLOT_CONFIG = {
  '24h': { hoursBefore: 24, closesHoursBefore: 12 },
  '12h': { hoursBefore: 12, closesHoursBefore: 1 },
  '1h': { hoursBefore: 1, closesHoursBefore: 0 },
};

function clinicDocRef() {
  return db.collection('clinics').doc(CLINIC_ID).collection('shared').doc('shared');
}

function parseAppointment(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeSlotWindow(appointmentDate, slot) {
  const cfg = SLOT_CONFIG[slot];
  const start = new Date(appointmentDate.getTime() - cfg.hoursBefore * 60 * 60 * 1000);
  const end = new Date(appointmentDate.getTime() - cfg.closesHoursBefore * 60 * 60 * 1000);
  return { start, end };
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function generateReminderText(lead, slot) {
  const [date = '[Data]', time = '[Horário]'] = String(lead.dataAgendamento || '').split(' ');
  const name = firstName(lead.nome);

  if (slot === '24h') {
    return `Olá, ${name}! Tudo bem?\n\nPassando para lembrar da sua consulta na OdontoCompany Olímpia, dia ${date}, às ${time}.\n\nJá deixamos tudo reservado para o seu atendimento.\n\nTe esperamos! 🦷💚`;
  }

  if (slot === '12h') {
    return `Olá, ${name}! Tudo bem?\n\nSó reforçando o seu horário na OdontoCompany Olímpia: dia ${date}, às ${time}.\n\nSeu atendimento está reservado e estaremos te aguardando. 💚`;
  }

  return `Olá, ${name}! 💚\n\nEstá chegando a hora do seu atendimento na OdontoCompany Olímpia. Seu horário é às ${time}.\n\nJá estamos preparando sua sala e te aguardamos por aqui.\n\nAté já! ✨`;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function ensure10DigitsLocal(phone) {
  if (!phone) return null;
  let digits = normalizePhone(phone);
  if (digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === '9') digits = digits.slice(0, 2) + digits.slice(3);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits.length === 10 ? digits : null;
}

function isBlockedLead(lead) {
  if (!lead || !lead.dataAgendamento) return true;
  if (lead._deleted) return true;
  if (lead.lembretes?.disabled === true) return true;
  if (['Desistência', 'Fora da região', 'Finalizado'].includes(lead.etapaLead)) return true;
  if (['COMPARECEU', 'NÃO COMPARECEU'].includes(lead.comparecimento)) return true;
  return false;
}

function readJson(path, fallback) {
  try {
    if (!fs.existsSync(path)) return fallback;
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  try {
    fs.writeFileSync(path, JSON.stringify(value, null, 2));
  } catch (error) {
    console.error(`[reminder-worker] Falha ao gravar ${path}:`, error.message);
  }
}

function ledgerKey(leadId, slot) {
  return `${leadId}:${slot}`;
}

function isInLocalLedger(leadId, slot) {
  const ledger = readJson(SENT_LEDGER_FILE, {});
  return Boolean(ledger[ledgerKey(leadId, slot)]);
}

function markLocalLedger(leadId, slot, timestamp) {
  const ledger = readJson(SENT_LEDGER_FILE, {});
  ledger[ledgerKey(leadId, slot)] = timestamp.toISOString();
  writeJson(SENT_LEDGER_FILE, ledger);
}

function slotAlreadySent(lead, slot) {
  if (lead.lembretes?.sent?.[slot]) return true;
  if (slot === '24h' && lead.lembretes?.h24) return true;
  if (slot === '1h' && lead.lembretes?.today) return true;
  return isInLocalLedger(lead.id, slot);
}

function recordFailure(lead, slot, error) {
  const failures = readJson(SEND_FAILURES_FILE, {});
  const key = ledgerKey(lead.id, slot);
  const current = failures[key] || {
    leadId: lead.id,
    leadName: lead.nome,
    slot,
    attempts: 0,
    firstFailedAt: new Date().toISOString(),
  };
  current.attempts += 1;
  current.lastError = String(error || 'Erro desconhecido');
  current.lastFailedAt = new Date().toISOString();
  failures[key] = current;
  writeJson(SEND_FAILURES_FILE, failures);
}

function clearFailure(leadId, slot) {
  const failures = readJson(SEND_FAILURES_FILE, {});
  delete failures[ledgerKey(leadId, slot)];
  writeJson(SEND_FAILURES_FILE, failures);
}

async function backendConnected() {
  try {
    const response = await fetch(`${BACKEND_URL}/status`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.connected === true;
  } catch {
    return false;
  }
}

async function getZApiCredentials() {
  const config = await getClinicZApiConfig(CLINIC_ID);
  const envKey = CLINIC_ID.toUpperCase().replace(/-/g, '_');
  const instanceId = config?.instanceId || process.env[`ZAPI_INSTANCE_${envKey}`] || process.env.ZAPI_INSTANCE_ID;
  const instanceToken = config?.instanceToken || process.env[`ZAPI_TOKEN_${envKey}`] || process.env.ZAPI_TOKEN;
  return instanceId && instanceToken ? { instanceId, instanceToken } : null;
}

async function getLastOutboundMessageTime(phoneId, originalPhone) {
  const possibleIds = new Set([phoneId]);
  try {
    possibleIds.add(normalizeForZApi(originalPhone));
  } catch {}

  let latest = null;
  for (const id of possibleIds) {
    if (!id) continue;
    try {
      const snap = await db.collection('conversations')
        .doc(id)
        .collection('messages')
        .where('fromMe', '==', true)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (snap.empty) continue;
      const value = snap.docs[0].data()?.timestamp;
      if (!value) continue;
      const date = value instanceof admin.firestore.Timestamp ? value.toDate() : new Date(value);
      if (!Number.isNaN(date.getTime()) && (!latest || date > latest)) latest = date;
    } catch (error) {
      console.warn(`[reminder-worker] Não foi possível checar cooldown em conversations/${id}:`, error.message);
    }
  }
  return latest;
}

async function cooldownAllows(lead) {
  const phoneId = ensure10DigitsLocal(lead.telefone);
  if (!phoneId) return false;
  const lastOutbound = await getLastOutboundMessageTime(phoneId, lead.telefone);
  if (!lastOutbound) return true;
  const diffMinutes = (Date.now() - lastOutbound.getTime()) / 60000;
  return diffMinutes >= COOLDOWN_MINUTES;
}

function activeSlotForLead(lead, now, appointment) {
  // Mais próximo da consulta ganha prioridade caso haja qualquer sobreposição acidental.
  for (const slot of ['1h', '12h', '24h']) {
    if (slotAlreadySent(lead, slot)) continue;
    const { start, end } = computeSlotWindow(appointment, slot);
    if (now >= start && now < end) return slot;
  }
  return null;
}

function futureSlotsForLead(lead, now, appointment) {
  const out = [];
  for (const slot of ['24h', '12h', '1h']) {
    if (slotAlreadySent(lead, slot)) continue;
    const { start } = computeSlotWindow(appointment, slot);
    if (start > now) {
      out.push({
        leadId: lead.id,
        leadName: lead.nome,
        telefone: lead.telefone,
        servicoProcurado: lead.servicoProcurado,
        slot,
        scheduledFor: start.toISOString(),
        appointmentDate: lead.dataAgendamento,
      });
    }
  }
  return out;
}

async function saveZApiOutboundMessage(lead, slot, message, zapiData) {
  try {
    const phone = normalizeForZApi(lead.telefone);
    const msgId = String(zapiData?.messageId || zapiData?.id || `reminder-${slot}-${Date.now()}`);
    const convRef = db.collection('conversations').doc(phone);
    const msgRef = convRef.collection('messages').doc(msgId);
    const timestamp = admin.firestore.Timestamp.now();

    await msgRef.set({
      id: msgId,
      body: message,
      fromMe: true,
      timestamp,
      read: true,
      source: 'z-api-reminder',
      reminderSlot: slot,
      clinicId: CLINIC_ID,
    }, { merge: true });

    await convRef.set({
      telefone: phone,
      leadNome: lead.nome || null,
      lastMessage: message,
      lastMessageAt: timestamp,
      unreadCount: 0,
    }, { merge: true });
  } catch (error) {
    console.warn('[reminder-worker] Lembrete enviado, mas falhou ao registrar conversa Z-API:', error.message);
  }
}

async function sendReminder(lead, slot, zapiCredentials) {
  const message = generateReminderText(lead, slot);

  // Preferência: Z-API, porque não depende do Chrome/WhatsApp Web local.
  if (zapiCredentials) {
    try {
      const phone = normalizeForZApi(lead.telefone);
      const result = await sendTextMessage(
        zapiCredentials.instanceId,
        zapiCredentials.instanceToken,
        phone,
        message,
      );

      if (result.success) {
        await saveZApiOutboundMessage(lead, slot, message, result.data);
        return { transport: 'z-api', data: result.data };
      }
      console.warn(`[reminder-worker] Z-API falhou para ${lead.nome}; tentando servidor local: ${result.error}`);
    } catch (error) {
      console.warn(`[reminder-worker] Erro Z-API para ${lead.nome}; tentando servidor local: ${error.message}`);
    }
  }

  if (!(await backendConnected())) {
    throw new Error('Z-API indisponível e servidor WhatsApp local desconectado');
  }

  const response = await fetch(`${BACKEND_URL}/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telefone: lead.telefone,
      message,
      isReminder: true,
      reminderSlot: slot,
      clinicId: CLINIC_ID,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return { transport: 'whatsapp-web', data: await response.json() };
}

async function markSentInFirestore(leadId, slot, timestamp) {
  const ref = clinicDocRef();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`Documento da clínica não encontrado: ${CLINIC_ID}`);

    const data = snap.data() || {};
    const leads = Array.isArray(data.leads) ? data.leads : [];
    const index = leads.findIndex((lead) => lead.id === leadId);
    if (index < 0) throw new Error(`Lead ${leadId} não encontrado`);

    const lead = leads[index];
    const sent = { ...(lead.lembretes?.sent || {}) };
    if (sent[slot]) return;

    sent[slot] = timestamp.toISOString();
    leads[index] = {
      ...lead,
      lembretes: {
        h24: Boolean(lead.lembretes?.h24 || slot === '24h'),
        today: Boolean(lead.lembretes?.today || slot === '1h'),
        ...lead.lembretes,
        sent,
      },
    };

    const payload = attachLastWriter(
      { leads, lastUpdated: new Date().toISOString() },
      'reminder-worker.js',
      'reminder-worker',
    );
    tx.set(ref, payload, { merge: true });
  });
}

async function runReminderCycle() {
  const now = new Date();

  if (!AUTOMATION_ENABLED) {
    console.log('[reminder-worker] Automação desabilitada por REMINDER_AUTOMATION_ENABLED=false');
    return;
  }

  const ref = clinicDocRef();
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`[reminder-worker] Documento clinics/${CLINIC_ID}/shared/shared não encontrado`);
    return;
  }

  const zapiCredentials = await getZApiCredentials();
  if (zapiCredentials) {
    console.log('[reminder-worker] Transporte preferencial: Z-API (fallback WhatsApp Web)');
  } else {
    console.log('[reminder-worker] Z-API não configurada; usando WhatsApp Web local');
  }

  const leads = Array.isArray(snap.data()?.leads) ? snap.data().leads : [];
  const nextSends = [];
  let checked = 0;
  let sentCount = 0;

  for (const lead of leads) {
    if (isBlockedLead(lead)) continue;

    const appointment = parseAppointment(lead.dataAgendamento);
    if (!appointment || appointment <= now) continue;

    const normalized = normalizePhone(lead.telefone);
    const canonicalMyPhone = ensure10DigitsLocal(MY_PHONE);
    const canonicalLeadPhone = ensure10DigitsLocal(normalized);
    if (!canonicalLeadPhone) continue;
    if (canonicalMyPhone && canonicalLeadPhone === canonicalMyPhone) continue;

    checked += 1;
    nextSends.push(...futureSlotsForLead(lead, now, appointment));

    const slot = activeSlotForLead(lead, now, appointment);
    if (!slot) continue;

    if (!(await cooldownAllows(lead))) {
      console.log(`[reminder-worker] ${lead.nome}: ${slot} aguardando cooldown de ${COOLDOWN_MINUTES} min`);
      continue;
    }

    try {
      console.log(`[reminder-worker] Enviando ${slot} para ${lead.nome} (${lead.dataAgendamento})`);
      const result = await sendReminder(lead, slot, zapiCredentials);

      const sentAt = new Date();
      markLocalLedger(lead.id, slot, sentAt);
      clearFailure(lead.id, slot);
      await markSentInFirestore(lead.id, slot, sentAt);
      sentCount += 1;
      console.log(`[reminder-worker] ✅ ${lead.nome}: ${slot} enviado via ${result.transport} e registrado`);
    } catch (error) {
      recordFailure(lead, slot, error.message);
      console.error(`[reminder-worker] ❌ ${lead.nome}: falha no ${slot}:`, error.message);
    }
  }

  nextSends.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  writeJson(NEXT_SENDS_FILE, nextSends);
  console.log(`[reminder-worker] Rodada concluída: ${checked} agendamentos futuros, ${sentCount} enviados, ${nextSends.length} próximos disparos`);
}

let running = false;
async function safeRun() {
  if (running) return;
  running = true;
  try {
    await runReminderCycle();
  } catch (error) {
    console.error('[reminder-worker] Erro inesperado na rodada:', error);
  } finally {
    running = false;
  }
}

console.log('');
console.log('===========================================================');
console.log('  LEMBRETES AUTOMÁTICOS ATIVOS — ODONTOCOMPANY OLÍMPIA');
console.log('  Slots: 24h • 12h • 1h antes da consulta');
console.log(`  Clínica: ${CLINIC_ID}`);
console.log(`  Intervalo: ${Math.round(INTERVAL_MS / 1000)}s`);
console.log(`  Automação: ${AUTOMATION_ENABLED ? 'ATIVA' : 'DESATIVADA'}`);
console.log('===========================================================');
console.log('');

setTimeout(() => {
  safeRun();
  setInterval(safeRun, INTERVAL_MS);
}, START_DELAY_MS);
