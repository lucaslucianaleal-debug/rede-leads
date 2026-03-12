const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function nowTag() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function run() {
  try {
    // Find a user with clinicId
    const usersSnap = await db.collection('users').limit(50).get();
    let chosen = null;
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (data && data.clinicId) {
        chosen = { uid: d.id, clinicId: data.clinicId, data };
        break;
      }
    }
    if (!chosen) {
      console.error('No user with clinicId found in `users` collection. Abort.');
      process.exit(2);
    }

    console.log('Using user:', chosen.uid, 'clinicId:', chosen.clinicId);
    const clinicId = chosen.clinicId;
    const targetDocRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');

    const snapshot = await targetDocRef.get();
    const existingLeads = (snapshot.exists && (snapshot.data().leads || [])) || [];
    console.log('Existing leads count at target before test:', existingLeads.length);

    const testId = `test_${nowTag()}`;
    const testLead = {
      id: testId,
      nome: `TEST LEAD ${nowTag()}`,
      telefone: `+55${Math.floor(1000000000 + Math.random()*9000000000)}`,
      dataCriacao: new Date().toLocaleDateString('pt-BR'),
      dataContato: new Date().toLocaleDateString('pt-BR'),
      servicoProcurado: 'Teste',
      captador: 'script-test',
      fonteLead: 'Online',
      etapaLead: 'Novo',
      status: 'QUENTE',
      respostaLead: '',
    };

    const newLeads = [...existingLeads, testLead];
    await targetDocRef.set({ leads: newLeads, lastUpdated: new Date().toISOString() }, { merge: true });

    console.log('Wrote test lead to:', `clinics/${clinicId}/shared/shared`);

    // Read back and verify
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
    console.error('Error during test:', e);
    process.exit(1);
  }
}

run();
