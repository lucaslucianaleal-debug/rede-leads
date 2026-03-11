// Script para sincronizar e mesclar conversas duplicadas de um mesmo lead
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Função para normalizar telefone para 10 dígitos (remove extra '9' e prefixo 55)
function ensure10Digits(num) {
  num = String(num || '').replace(/\D/g, '');
  if (num.startsWith('55')) num = num.slice(2);
  if (num.length === 11 && num[2] === '9') num = num.slice(0,2) + num.slice(3);
  if (num.length > 10) num = num.slice(-10);
  if (num.length === 10) return num;
  return null;
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

async function updateConversationsForLead(lead) {
  try {
    if (!lead || !lead.telefone) return;
    const leadDigits = String(lead.telefone || '').replace(/\D/g, '');
    const leadNorm = leadDigits.startsWith('55') ? leadDigits.slice(2) : leadDigits;
    if (leadNorm.length < 8) return;
    const leadCanonical = ensure10Digits(leadNorm) || leadNorm.slice(-10);
    const leadLast8 = leadCanonical.slice(-8);

    const convSnaps = await db.collection('conversations').get();
    const targetId = leadCanonical;
    const targetRef = db.collection('conversations').doc(targetId);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      await targetRef.set({ telefone: leadCanonical, leadId: lead.id, leadNome: lead.nome }, { merge: true });
    } else {
      await targetRef.set({ leadId: lead.id, leadNome: lead.nome }, { merge: true });
    }

    for (const doc of convSnaps.docs) {
      const idDigits = doc.id.replace(/\D/g, '');
      const idCanonical = ensure10Digits(idDigits) || idDigits.slice(-10);
      if (idCanonical === leadCanonical) continue;
      const data = doc.data() || {};
      const telFieldDigits = String(data.telefone || '').replace(/\D/g, '');
      const telFieldCanonical = ensure10Digits(telFieldDigits) || telFieldDigits.slice(-10);
      if ((idCanonical && idCanonical.slice(-8) === leadLast8) || (telFieldCanonical && telFieldCanonical.slice(-8) === leadLast8)) {
        const srcRef = db.collection('conversations').doc(doc.id);
        const msgs = await srcRef.collection('messages').get();
        for (const m of msgs.docs) {
          const targetMsgRef = targetRef.collection('messages').doc(m.id);
          const exists = await targetMsgRef.get();
          if (!exists.exists) {
            await targetMsgRef.set(m.data());
          }
        }
        const srcData = doc.data() || {};
        const updates = {};
        if (!targetSnap.exists || !targetSnap.data()?.leadId) updates.leadId = lead.id;
        if (!targetSnap.exists || !targetSnap.data()?.leadNome) updates.leadNome = lead.nome;
        if (!targetSnap.exists || !targetSnap.data()?.telefone) updates.telefone = leadCanonical;
        if (Object.keys(updates).length) await targetRef.set(updates, { merge: true });
        await srcRef.delete();
        console.log(`[lead-sync] Mesclada conversa ${doc.id} -> ${targetId} para lead ${lead.id}`);
      }
    }
  } catch (e) {
    console.error('[lead-sync] erro ao atualizar conversas para lead', lead?.id, e.message || e);
  }
}

async function main() {
  const crmSharedRef = db.collection('crm_data').doc('shared');
  const doc = await crmSharedRef.get();
  const leads = doc.exists ? doc.data()?.leads || [] : [];
  console.log(`[lead-sync] Sincronizando ${leads.length} leads...`);
  for (const l of leads) {
    await updateConversationsForLead(l);
  }
  console.log('[lead-sync] Sincronização concluída!');
}

main();
