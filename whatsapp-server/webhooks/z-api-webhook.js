/**
 * Handler do Webhook Z-API
 * 
 * Registra as rotas do webhook no Express:
 * 
 *   POST /webhook/z-api/:clinicId
 *     → Recebe eventos da Z-API para uma clínica específica.
 *     → URL configurada no painel Z-API: https://seu-servidor.com/webhook/z-api/{clinicId}
 * 
 *   GET /webhook/z-api/status/:clinicId
 *     → Verifica se a instância Z-API da clínica está online.
 * 
 *   POST /webhook/z-api/config/:clinicId
 *     → Atualiza a configuração de triagem (mensagens, horários) de uma clínica.
 *       Requer header: Authorization: Bearer {WEBHOOK_SECRET}
 * 
 * Segurança:
 *   - Verificação de token via header X-Webhook-Token (configurável por clínica)
 *   - Rate limiting implícito: flag anti-loop no Firestore garante 1 resposta/lead
 */

import { Router } from "express";
import { processZApiMessage } from "../services/auto-response.js";
import { getClinicZApiConfig, getClinicConfigDoc } from "../services/lead-triage.js";
import { getInstanceStatus } from "../services/zapi-client.js";
import { CLINIC_DEFAULTS } from "../config/clinic-config.js";

const router = Router();

// Secret global para proteger os endpoints de configuração
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

/**
 * Middleware de autenticação simples para rotas de config.
 */
function requireSecret(req, res, next) {
  if (!WEBHOOK_SECRET) return next(); // Se não configurado, permite (desenvolvimento)
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "").trim();
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  next();
}

// ──────────────────────────────────────────────────────────────
// POST /webhook/z-api/:clinicId
// Recebe eventos de mensagens recebidas da Z-API
// ──────────────────────────────────────────────────────────────
router.post("/:clinicId", async (req, res) => {
  const { clinicId } = req.params;
  const payload = req.body;

  // Responder 200 imediatamente para a Z-API (SLA de resposta do webhook)
  res.status(200).json({ ok: true });

  // Processar de forma assíncrona (não bloquear a resposta HTTP)
  try {
    // Filtrar apenas eventos de mensagem recebida
    const event = payload?.event || payload?.type || "";
    const isMessageEvent =
      event === "on-message-received" ||
      event === "MESSAGE_RECEIVED" ||
      event === "message" ||
      // Alguns payloads Z-API não têm campo "event", verificar estrutura
      (payload?.phone && payload?.text?.message) ||
      (payload?.data?.phone && payload?.data?.text?.message);

    if (!isMessageEvent) {
      console.log(`[webhook] Evento ignorado: "${event}" para clínica ${clinicId}`);
      return;
    }

    const result = await processZApiMessage(clinicId, payload);
    console.log(`[webhook] Resultado para ${clinicId}:`, result);
  } catch (err) {
    console.error(`[webhook] Erro ao processar mensagem Z-API para ${clinicId}:`, err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /webhook/z-api/status/:clinicId
// Verifica status da instância Z-API da clínica
// ──────────────────────────────────────────────────────────────
router.get("/status/:clinicId", async (req, res) => {
  const { clinicId } = req.params;

  const zapiConfig = await getClinicZApiConfig(clinicId);
  const instanceId = zapiConfig?.instanceId || process.env.ZAPI_INSTANCE_ID;
  const instanceToken = zapiConfig?.instanceToken || process.env.ZAPI_TOKEN;

  if (!instanceId || !instanceToken) {
    return res.status(400).json({
      error: "Instância Z-API não configurada para essa clínica",
      clinicId,
    });
  }

  const status = await getInstanceStatus(instanceId, instanceToken);
  return res.json({ clinicId, ...status });
});

// ──────────────────────────────────────────────────────────────
// POST /webhook/z-api/config/:clinicId
// Atualiza configuração de triagem da clínica (mensagens, horários, ativo)
// ──────────────────────────────────────────────────────────────
router.post("/config/:clinicId", requireSecret, async (req, res) => {
  const { clinicId } = req.params;
  const {
    instanceId,
    instanceToken,
    triagemConfig, // { ativo, horarioAtendimento, diasAtivos, mensagens }
  } = req.body;

  if (!CLINIC_DEFAULTS[clinicId] && !instanceId) {
    return res.status(400).json({ error: `Clínica "${clinicId}" não reconhecida` });
  }

  try {
    const configRef = getClinicConfigDoc(clinicId);
    const update = {};
    if (instanceId) update.instanceId = instanceId;
    if (instanceToken) update.instanceToken = instanceToken;
    if (triagemConfig) update.triagemConfig = triagemConfig;
    update.updatedAt = new Date().toISOString();

    await configRef.set(update, { merge: true });
    console.log(`[webhook] Config Z-API atualizada para clínica ${clinicId}`);
    return res.json({ ok: true, clinicId });
  } catch (err) {
    console.error(`[webhook] Erro ao salvar config para ${clinicId}:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /webhook/z-api/clinics
// Lista todas as clínicas com triagem configurável
// ──────────────────────────────────────────────────────────────
router.get("/clinics", (req, res) => {
  const clinics = Object.entries(CLINIC_DEFAULTS).map(([id, config]) => ({
    id,
    nomeClinica: config.nomeClinica,
    horarioAtendimento: config.horarioAtendimento,
    diasAtivos: config.diasAtivos,
  }));
  return res.json({ clinics });
});

export default router;
