/**
 * Serviço de resposta automática de triagem.
 * 
 * Orquestra a triagem completa de um lead recém-chegado:
 *  1. Verifica se a auto-resposta já foi enviada (flag anti-loop)
 *  2. Determina se é horário comercial ou fora do horário
 *  3. Envia a mensagem correta via Z-API
 *  4. Marca o lead como respondido
 */

import { sendTextMessage } from "./zapi-client.js";
import {
  findLeadByPhone,
  createTriageLead,
  markTriageAutoResponded,
  saveIncomingMessage,
  getClinicZApiConfig,
} from "./lead-triage.js";
import {
  CLINIC_DEFAULTS,
  isBusinessHours,
  normalizePhoneInternational,
} from "../config/clinic-config.js";

/**
 * Processa um evento de mensagem recebida da Z-API.
 * 
 * @param {string} clinicId - ID da clínica (ex: "odontocompany-novohorizonte")
 * @param {object} payload - Payload bruto do webhook Z-API
 * @returns {Promise<{handled: boolean, reason: string}>}
 */
export async function processZApiMessage(clinicId, payload) {
  // ── 1. Extrair telefone e mensagem do payload Z-API ──
  const rawPhone =
    payload?.phone ||
    payload?.from ||
    payload?.data?.phone ||
    payload?.data?.from;

  const body =
    payload?.text?.message ||
    payload?.message ||
    payload?.data?.text?.message ||
    payload?.data?.body ||
    "";

  const msgId =
    payload?.messageId ||
    payload?.id ||
    payload?.data?.messageId ||
    `zapi-${Date.now()}`;

  // Ignorar mensagens enviadas pelo próprio bot
  const fromMe =
    payload?.fromMe === true ||
    payload?.isFromMe === true ||
    payload?.data?.fromMe === true;

  if (fromMe) {
    return { handled: false, reason: "Mensagem própria — ignorada" };
  }

  if (!rawPhone) {
    console.warn("[auto-response] Webhook sem telefone:", JSON.stringify(payload));
    return { handled: false, reason: "Telefone ausente no payload" };
  }

  // ── 2. Normalizar telefone para padrão internacional ──
  let phoneNorm;
  try {
    phoneNorm = normalizePhoneInternational(rawPhone);
  } catch (e) {
    console.warn(`[auto-response] Telefone inválido: ${rawPhone}`);
    return { handled: false, reason: `Telefone inválido: ${rawPhone}` };
  }

  console.log(`[auto-response] Processando mensagem da clínica ${clinicId}, phone=${phoneNorm}`);

  // ── 3. Buscar configuração Z-API da clínica ──
  const zapiConfig = await getClinicZApiConfig(clinicId);
  const clinicDefaults = CLINIC_DEFAULTS[clinicId];

  if (!clinicDefaults) {
    console.error(`[auto-response] Clínica não configurada: ${clinicId}`);
    return { handled: false, reason: `Clínica ${clinicId} não encontrada na config` };
  }

  // Credenciais Z-API da clínica (Firestore tem prioridade, fallback para env)
  const instanceId =
    zapiConfig?.instanceId ||
    process.env[`ZAPI_INSTANCE_${clinicId.toUpperCase().replace(/-/g, "_")}`] ||
    process.env.ZAPI_INSTANCE_ID;

  const instanceToken =
    zapiConfig?.instanceToken ||
    process.env[`ZAPI_TOKEN_${clinicId.toUpperCase().replace(/-/g, "_")}`] ||
    process.env.ZAPI_TOKEN;

  if (!instanceId || !instanceToken) {
    console.error(`[auto-response] Credenciais Z-API ausentes para clínica ${clinicId}`);
    return { handled: false, reason: "Credenciais Z-API ausentes" };
  }

  // ── 4. Buscar lead no Firestore ──
  const { lead, leads, docRef } = await findLeadByPhone(clinicId, phoneNorm);

  // ── 5. Salvar mensagem no histórico da conversa ──
  await saveIncomingMessage(phoneNorm, body, msgId);

  // ── 6. Verificar flag anti-loop ──
  if (lead?.triagemStatus?.autoRespondida === true) {
    console.log(`[auto-response] Lead ${phoneNorm} já foi auto-respondido — ignorando`);
    return { handled: false, reason: "Já auto-respondido anteriormente" };
  }

  // ── 7. Criar lead novo se não existir ──
  let leadFinal = lead;
  if (!lead) {
    leadFinal = await createTriageLead(clinicId, phoneNorm, body, leads, docRef);
  }

  // ── 8. Verificar horário e escolher mensagem ──
  // Usar config do Firestore se disponível, senão usar defaults
  const triagemConfig = zapiConfig?.triagemConfig || {};
  const mensagens = triagemConfig?.mensagens || clinicDefaults.mensagens;
  const clinicConfigForHours = {
    horarioAtendimento: triagemConfig?.horarioAtendimento || clinicDefaults.horarioAtendimento,
    diasAtivos: triagemConfig?.diasAtivos || clinicDefaults.diasAtivos,
  };

  // Verificar se triagem automática está ativa para essa clínica
  const triagemAtiva = triagemConfig?.ativo !== false; // default: ativo
  if (!triagemAtiva) {
    console.log(`[auto-response] Triagem automática desativada para clínica ${clinicId}`);
    return { handled: false, reason: "Triagem desativada para essa clínica" };
  }

  const emHorarioComercial = isBusinessHours(clinicConfigForHours);
  const tipoResposta = emHorarioComercial ? "comercial" : "fora_horario";
  const mensagem = mensagens[tipoResposta];

  if (!mensagem) {
    console.error(`[auto-response] Mensagem de ${tipoResposta} não configurada para ${clinicId}`);
    return { handled: false, reason: "Mensagem não configurada" };
  }

  // ── 9. Enviar resposta automática via Z-API ──
  console.log(`[auto-response] Enviando resposta "${tipoResposta}" para ${phoneNorm}`);
  const result = await sendTextMessage(instanceId, instanceToken, phoneNorm, mensagem);

  if (!result.success) {
    console.error(`[auto-response] Falha ao enviar mensagem para ${phoneNorm}:`, result.error);
    // Não marcar como respondido para poder tentar novamente depois
    return { handled: false, reason: `Falha no envio: ${result.error}` };
  }

  // ── 10. Marcar lead como auto-respondido (anti-loop) ──
  // Buscar leads novamente (pode ter mudado se criamos o lead agora)
  const { leads: leadsAtualizados, docRef: docRefAtual } = await findLeadByPhone(clinicId, phoneNorm);
  await markTriageAutoResponded(clinicId, phoneNorm, tipoResposta, leadsAtualizados, docRefAtual);

  console.log(`[auto-response] ✅ Triagem concluída para ${phoneNorm} — resposta: ${tipoResposta}`);
  return {
    handled: true,
    reason: `Resposta "${tipoResposta}" enviada com sucesso`,
    phone: phoneNorm,
    tipoResposta,
  };
}
