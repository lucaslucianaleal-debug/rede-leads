const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function todayStr() {
  return new Date().toLocaleDateString('pt-BR');
}

async function list() {
  try {
    const today = todayStr();
    console.log('Today:', today);
    console.log('\n--- crm_data/shared ---');
    const crmShared = await db.collection('crm_data').doc('shared').get();
    let count = 0;
    if (crmShared.exists) {
      const leads = crmShared.data().leads || [];
      for (const l of leads) {
        if ((l.dataCriacao || '').startsWith(today)) {
          count++;
          console.log(`crm_data/shared | - | ${l.nome || ''} | ${l.telefone || ''} | ${l.dataCriacao || ''} | captador:${l.captador||''} | id:${l.id||''}`);
        }
      }
    }
    console.log('Found in crm_data/shared:', count);

    // clinics list
    const clinicsSnap = await db.collection('clinics').get();
    for (const clinicDoc of clinicsSnap.docs) {
      const clinicId = clinicDoc.id;
      const docRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
      const snap = await docRef.get();
      let ccount = 0;
      if (snap.exists) {
        const leads = snap.data().leads || [];
        for (const l of leads) {
          if ((l.dataCriacao || '').startsWith(today)) {
            ccount++;
            console.log(`clinics | ${clinicId} | ${l.nome || ''} | ${l.telefone || ''} | ${l.dataCriacao || ''} | captador:${l.captador||''} | id:${l.id||''}`);
          }
        }
      }
      if (ccount>0) console.log(`Found in clinics/${clinicId}: ${ccount}`);
    }

    console.log('\n--- leads collection (sample 200) ---');
    const leadsSnap = await db.collection('leads').limit(200).get();
    let lcount = 0;
    for (const d of leadsSnap.docs) {
      const l = d.data();
      if ((l.dataCriacao || '').startsWith(today)) {
        lcount++;
        console.log(`leads | ${d.id} | ${l.nome || ''} | ${l.telefone || ''} | ${l.dataCriacao || ''} | captador:${l.captador||''} | createdBy:${l.createdBy||''}`);
      }
    }
    console.log('Found in leads collection:', lcount);

  } catch (e) {
    console.error('Error listing leads today:', e);
    process.exit(1);
  }
}

list();
