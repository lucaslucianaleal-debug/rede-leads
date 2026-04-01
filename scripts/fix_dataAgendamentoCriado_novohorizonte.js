// Corrige leads da clínica Novo Horizonte sem dataAgendamentoCriado
// Preenche dataAgendamentoCriado com dataAgendamento (apenas data) se estiver faltando
// Uso: node scripts/fix_dataAgendamentoCriado_novohorizonte.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { format } = require('date-fns');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

const CLINIC_ID = 'odontocompany-novohorizonte';
const LEADS_COLLECTION = `clinics/${CLINIC_ID}/leads`;

async function fixLeads() {
  const snapshot = await db.collection(LEADS_COLLECTION).get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const lead = doc.data();
    if (lead.dataAgendamento && !lead.dataAgendamentoCriado) {
      // Extrai só a data (dd/MM/yyyy) se vier com hora
      const data = lead.dataAgendamento.split(' ')[0];
      await doc.ref.update({ dataAgendamentoCriado: data });
      updated++;
      console.log(`Corrigido lead ${doc.id}: dataAgendamentoCriado = ${data}`);
    }
  }
  console.log(`Total de leads corrigidos: ${updated}`);
}

fixLeads().catch(console.error);
