const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!process.argv[2]) {
  console.error('Usage: node check_clinic_and_write.cjs <clinicId>');
  process.exit(2);
}
const clinicId = process.argv[2];
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function nowTag() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function run() {
  try {
    const targetDocRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
    const snapshot = await targetDocRef.get();
    console.log(`Clinic path: clinics/${clinicId}/shared/shared`);
    console.log('Exists:', snapshot.exists);
    const existingLeads = (snapshot.exists && (snapshot.data().leads || [])) || [];
    console.log('Existing leads count at target before test:', existingLeads.length);

    // Write a test lead
    const testId = `nh_test_${nowTag()}`;
    const testLead = {
      id: testId,
      nome: `NH TEST LEAD ${nowTag()}`,
      telefone: `+55${Math.floor(1000000000 + Math.random()*9000000000)}`,
      dataCriacao: new Date().toLocaleDateString('pt-BR'),
      dataContato: new Date().toLocaleDateString('pt-BR'),
      servicoProcurado: 'Teste NH',
      captador: 'script-test-nh',
      fonteLead: 'Online',
      etapaLead: 'Novo',
      status: 'QUENTE',
    };

    const newLeads = [...existingLeads, testLead];
    await targetDocRef.set({ leads: newLeads, lastUpdated: new Date().toISOString() }, { merge: true });
    console.log('Wrote test lead to:', `clinics/${clinicId}/shared/shared`);

    // Read back
    const after = await targetDocRef.get();
    const afterLeads = (after.exists && (after.data().leads || [])) || [];
    const found = afterLeads.find(l => l.id === testId);
    if (found) {
      console.log('Test lead found. Path:', `clinics/${clinicId}/shared/shared`, 'leadId:', testId);
      console.log('Leads count after:', afterLeads.length);
      process.exit(0);
    } else {
      console.error('Test lead NOT found after write.');
      process.exit(3);
    }
  } catch (e) {
    console.error('Error during check:', e);
    process.exit(1);
  }
}

run();
