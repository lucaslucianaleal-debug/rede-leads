/**
 * Webhook Z-API simplificado.
 * Recebe mensagens da Z-API e salva novos leads em clinics/{clinicId}/triagem/{phone}
 */

import { Router } from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = Router();

// ──────────────────────────────────────────────────────────────
// POST /webhook/z-api/:clinicId
// Recebe eventos de mensagens recebidas da Z-API
// ──────────────────────────────────────────────────────────────
router.post("/:clinicId", async (req, res) => {
  const { clinicId } = req.params;
  const payload = req.body;

  // Responder 200 imediatamente para a Z-API (SLA de resposta do webhook)
  res.status(200).json({ ok: true });

  try {
    // Ignorar mensagens enviadas por nós
    const fromMe = payload?.data?.isFromMe || payload?.isFromMe || false;
    if (fromMe) return;

    // Extrair telefone e mensagem do payload Z-API
    const phone = payload?.data?.phone || payload?.phone || "";
    const message = payload?.data?.text?.message || payload?.text?.message || "";
    const event = payload?.event || payload?.type || "";

    // Aceitar apenas eventos de mensagem recebida
    const isMessage =
      event === "on-message-received" ||
      event === "MESSAGE_RECEIVED" ||
      (phone && message);

    if (!isMessage || !phone) {
      console.log(`[webhook] Evento ignorado: "${event}" – sem telefone/mensagem`);
      return;
    }

    const phoneNorm = phone.replace(/\D/g, "");

    // Salvar na coleção triagem da clínica (apenas se não existir ainda)
    const db = getFirestore();
    const ref = db.collection("clinics").doc(clinicId).collection("triagem").doc(phoneNorm);
    const existing = await ref.get();

    if (!existing.exists) {
      const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await ref.set({
        telefone: phoneNorm,
        mensagem: message,
        dataRecebimento: agora,
        createdAt: Date.now(),
        lida: false,
      });
      console.log(`[webhook] Novo lead em triagem: ${phoneNorm} → clínica ${clinicId}`);
    } else {
      console.log(`[webhook] Lead ${phoneNorm} já existe em triagem, ignorando`);
    }
  } catch (err) {
    console.error(`[webhook] Erro ao salvar triagem para ${clinicId}:`, err);
  }
});

export default router;
