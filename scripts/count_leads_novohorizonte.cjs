const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLINIC = 'odontocompany-novohorizonte';

async function run() {
  try {
    const docRef = db.collection('clinics').doc(CLINIC).collection('shared').doc('shared');
    const snap = await docRef.get();
    if (!snap.exists) {
      console.log('No shared doc for', CLINIC);
      process.exit(0);
    }
    const data = snap.data() || {};
    const leads = Array.isArray(data.leads) ? data.leads : (data.leads ? Object.values(data.leads) : []);
    console.log('clinic:', CLINIC);
    console.log('leads_count:', leads.length);
    // optionally list first 10 lead ids or names
    const sample = leads.slice(0, 10).map(l => l.id || l._id || l.phone || l.name || JSON.stringify(l).slice(0,40));
    console.log('sample (up to 10):');
    sample.forEach(s => console.log('-', s));
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
