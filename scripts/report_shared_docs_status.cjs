const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const clinics = [
  'odontocompany-olimpia',
  'odontocompany-badybass',
  'odontocompany-novohorizonte'
];

async function check() {
  try {
    console.log('Checking crm_data/shared');
    const crmShared = await db.collection('crm_data').doc('shared').get();
    if (crmShared.exists) {
      const data = crmShared.data();
      console.log('crm_data/shared -> leads:', (data.leads||[]).length, 'lastUpdated:', data.lastUpdated);
    } else {
      console.log('crm_data/shared -> not found');
    }

    for (const c of clinics) {
      const ref = db.collection('clinics').doc(c).collection('shared').doc('shared');
      const snap = await ref.get();
      if (snap.exists) {
        const d = snap.data();
        console.log(`${c} -> leads: ${(d.leads||[]).length} lastUpdated: ${d.lastUpdated}`);
      } else {
        console.log(`${c} -> doc not found`);
      }
    }

    // Also look for scripts that set leads recently by checking backups dir
    const fs = require('fs');
    const path = 'backups/clinics';
    if (fs.existsSync(path)) {
      const clinicsDirs = fs.readdirSync(path);
      console.log('\nBackups present for clinics:', clinicsDirs.join(', '));
    }

  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

check();
