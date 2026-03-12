const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function readClinic(clinicId) {
  try {
    const docRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
    const snap = await docRef.get();
    if (!snap.exists) {
      console.log(`Document clinics/${clinicId}/shared/shared does NOT exist`);
      return;
    }
    const data = snap.data();
    const leads = Array.isArray(data?.leads) ? data.leads : [];
    console.log(`clinics/${clinicId}/shared/shared: leads=${leads.length}`);
    console.log('lastUpdated:', data?.lastUpdated || '(none)');
    console.log('sample (first 5 lead names):');
    for (let i = 0; i < Math.min(5, leads.length); i++) {
      console.log(`  - ${leads[i].nome || leads[i].name || '(no-name)'} (${leads[i].telefone || ''})`);
    }
  } catch (e) {
    console.error('Error reading clinic doc:', e);
  }
}

const clinicId = process.argv[2] || 'odontocompany-novohorizonte';
readClinic(clinicId).then(() => process.exit(0));
