const admin = require('firebase-admin');
const path = require('path');

// Load service account from whatsapp-server/serviceAccountKey.json
const svcPath = path.resolve(__dirname, '..', 'whatsapp-server', 'serviceAccountKey.json');
let svc;
try {
  svc = require(svcPath);
} catch (e) {
  console.error('serviceAccountKey.json not found at', svcPath);
  process.exit(2);
}

admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

(async function main(){
  try {
    const ref = db.doc('clinics/odontocompany-olimpia/shared/shared');
    const snap = await ref.get();
    console.log('DOCUMENT PATH: clinics/odontocompany-olimpia/shared/shared');
    console.log('exists:', snap.exists);
    if (snap.exists) {
      const data = snap.data();
      const leads = Array.isArray(data?.leads) ? data.leads : null;
      console.log('leads_count:', leads ? leads.length : 'no leads array');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Error reading document:', err);
    process.exit(1);
  }
})();
