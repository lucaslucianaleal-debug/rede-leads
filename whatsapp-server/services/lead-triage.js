/**
 * Serviço de triagem de leads.
 * 
 * Responsável por:
 *  - Verificar se o lead já existe no Firestore
 *  - Criar novo lead com etapa "triagem" se não existir
 *  - Verificar/atualizar flag anti-loop de auto-resposta
 *  - Salvar mensagem recebida no histórico da conversa
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { normalizePhoneInternational, formatDateTimeBrasilia, formatDateBrasilia } from "../config/clinic-config.js";

const db = getFirestore();

/**
 * Resolve o documento Firestore da clínica (clinics/{clinicId}/shared/shared)
 */
function getClinicLeadsDoc(clinicId) {
  return db.collection("clinics").doc(clinicId).collection("shared").doc("shared");
}

/**
 * Resolve o documento de configuração Z-API da clínica (clinics/{clinicId}/config/whatsapp)
 */
export function getClinicConfigDoc(clinicId) {
  return db.collection("clinics").doc(clinicId).collection("config").doc("whatsapp");
}

/**
 * Busca a configuração Z-API da clínica no Firestore.
 * Retorna null se não configurada.
 */
export async function getClinicZApiConfig(clinicId) {
  try {
    const snap = await getClinicConfigDoc(clinicId).get();
    if (snap.exists) return snap.data();
    return null;
  } catch (e) {
    console.error(`[lead-triage] Erro ao buscar config da clínica ${clinicId}:`, e);
    return null;
  }
}

/**
 * Normaliza número para o padrão internacional E.164 (5511999999999).
 * Compatível com o padrão usado na Z-API.
 */
export function normalizeForZApi(raw) {
  return normalizePhoneInternational(raw);
}

/**
 * Busca um lead pelo telefone normalizado dentro do array de leads da clínica.
 * 
 * @param {string} clinicId
 * @param {string} phoneNorm - Telefone no formato internacional (5511999999999)
 * @returns {Promise<{lead: object|null, leads: array, docRef: object}>}
 */
export async function findLeadByPhone(clinicId, phoneNorm) {
  const docRef = getClinicLeadsDoc(clinicId);
  const snap = await docRef.get();

  if (!snap.exists) {
    return { lead: null, leads: [], docRef };
  }

  const leads = (snap.data()?.leads || []);

  // Busca por telefone normalizado (vários formatos)
  const lead = leads.find((l) => {
    const t = String(l.telefone || "").replace(/\D/g, "");
    const norm = t.startsWith("55") ? t : `55${t}`;
    return norm === phoneNorm;
  }) || null;

  return { lead, leads, docRef };
}

/**
 * Cria um novo lead de triagem no Firestore.
 * 
 * @param {string} clinicId
 * @param {string} phoneNorm - Telefone no formato internacional
 * @param {string} mensagemInicial - Primeira mensagem recebida do lead
 * @param {array} leadsArray - Array atual de leads
 * @param {object} docRef - Referência ao documento Firestore
 * @returns {Promise<object>} Lead criado
 */
export async function createTriageLead(clinicId, phoneNorm, mensagemInicial, leadsArray, docRef) {
  const agora = formatDateTimeBrasilia();
  const hoje = formatDateBrasilia();

  const novoLead = {
    id: phoneNorm,
    telefone: phoneNorm,
    nome: phoneNorm, // Será atualizado posteriormente pelo atendente
    dataCriacao: hoje,
    dataContato: hoje,
    servicoProcurado: "",
    captador: "Z-API (Triagem Automática)",
    fonteLead: "Online",
    etapaLead: "triagem",
    status: "",
    respostaLead: "RESPONDEU",
    comparecimento: "",
    dataFollowUp: "",
    dataAgendamento: "",
    dataAgendamentoCriado: "",
    dataRetornoLigacao: "",
    observacao: `Primeiro contato via WhatsApp em ${agora}: "${mensagemInicial}"`,
    followUpCount: 0,
    lembretes: { h24: false, today: false },
    // Campos de controle de triagem
    triagemStatus: {
      recebida: true,
      dataPrimeiroContato: agora,
      autoRespondida: false,
      dataAutoResposta: null,
      horarioRecebimento: null,
    },
  };

  const novosLeads = [...leadsArray, novoLead];

  await docRef.set(
    {
      leads: novosLeads,
      lastUpdated: new Date().toISOString(),
      lastWriter: "z-api-webhook",
    },
    { merge: true }
  );

  console.log(`[lead-triage] Novo lead de triagem criado para ${phoneNorm} na clínica ${clinicId}`);
  return novoLead;
}

/**
 * Marca o lead como já auto-respondido (flag anti-loop).
 * 
 * @param {string} clinicId
 * @param {string} phoneNorm
 * @param {string} tipoResposta - "comercial" ou "fora_horario"
 * @param {array} leadsArray - Array atual de leads
 * @param {object} docRef - Referência ao documento Firestore
 */
export async function markTriageAutoResponded(clinicId, phoneNorm, tipoResposta, leadsArray, docRef) {
  const agora = formatDateTimeBrasilia();

  const novosLeads = leadsArray.map((l) => {
    const t = String(l.telefone || "").replace(/\D/g, "");
    const norm = t.startsWith("55") ? t : `55${t}`;
    if (norm !== phoneNorm) return l;

    return {
      ...l,
      triagemStatus: {
        ...(l.triagemStatus || {}),
        autoRespondida: true,
        dataAutoResposta: agora,
        horarioRecebimento: tipoResposta,
      },
    };
  });

  await docRef.set(
    {
      leads: novosLeads,
      lastUpdated: new Date().toISOString(),
      lastWriter: "z-api-webhook",
    },
    { merge: true }
  );

  console.log(`[lead-triage] Flag anti-loop marcada para ${phoneNorm} (${tipoResposta})`);
}

/**
 * Salva uma mensagem recebida no histórico de conversas do lead.
 * Usa a coleção conversations/{clinicId} ou conversations/{phoneNorm}.
 * 
 * @param {string} phoneNorm - Telefone no formato internacional
 * @param {string} body - Corpo da mensagem
 * @param {string} msgId - ID único da mensagem
 */
export async function saveIncomingMessage(phoneNorm, body, msgId) {
  const agora = formatDateTimeBrasilia();

  try {
    const msgRef = db
      .collection("conversations")
      .doc(phoneNorm)
      .collection("messages")
      .doc(msgId || `zapi-${Date.now()}`);

    await msgRef.set({
      id: msgId || `zapi-${Date.now()}`,
      body,
      fromMe: false,
      timestamp: Date.now(),
      createdAt: agora,
      source: "z-api",
    });

    // Atualizar lastMessage no documento raiz da conversa
    await db.collection("conversations").doc(phoneNorm).set(
      {
        telefone: phoneNorm,
        lastMessage: body,
        lastMessageTime: Date.now(),
        updatedAt: agora,
      },
      { merge: true }
    );

    console.log(`[lead-triage] Mensagem salva para ${phoneNorm}`);
  } catch (e) {
    console.error(`[lead-triage] Erro ao salvar mensagem para ${phoneNorm}:`, e);
  }
}
