const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLINICS = [
  'odontocompany-novohorizonte',
  'odontocompany-olimpia',
  'odontocompany-badybassit',
];
const TARGET_IDS = ['imported-1773317147766-0','imported-1773317147766-1'];

async function inspectClinic(clinicId) {
  const docRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
  const snap = await docRef.get();
  if (!snap.exists) return { clinicId, exists: false, leadsCount: 0, found: [] };
  const data = snap.data() || {};
  const leads = Array.isArray(data.leads) ? data.leads : (data.leads ? Object.values(data.leads) : []);
  const found = [];
  for (const t of TARGET_IDS) {
    if (leads.some(l => (l.id || l._id || l.phone || '').toString() === t)) found.push(t);
  }
  return { clinicId, exists: true, leadsCount: leads.length, found };
}

async function run() {
  try {
    const results = [];
    for (const c of CLINICS) {
      const r = await inspectClinic(c);
      results.push(r);
    }
    console.log('Check results:');
    for (const r of results) {
      console.log(`- ${r.clinicId}: exists=${r.exists}, leads=${r.leadsCount}, targets_found=[${r.found.join(',')}]`);
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
