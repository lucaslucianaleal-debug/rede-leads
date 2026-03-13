const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TARGET_IDS = ['imported-1773317147766-0','imported-1773317147766-1'];
const CLINICS = ['odontocompany-novohorizonte','odontocompany-badybassit','odontocompany-olimpia'];

async function findInClinic(clinicId, targetId) {
  const docRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const leads = Array.isArray(data.leads) ? data.leads : (data.leads ? Object.values(data.leads) : []);
  return leads.find(l => {
    const id = (l.id || l._id || l.phone || '').toString();
    return id === targetId;
  }) || null;
}

(async function run(){
  try {
    const report = {};
    for (const tid of TARGET_IDS) {
      report[tid] = {};
      for (const c of CLINICS) {
        const found = await findInClinic(c, tid);
        report[tid][c] = found ? { found: true, keys: Object.keys(found).slice(0,50), snippet: (found.name||found.phone||found.id||JSON.stringify(found).slice(0,80)) } : { found: false };
      }
    }
    // print detailed report
    console.log('Link check report:');
    for (const tid of TARGET_IDS) {
      console.log(`\n- Target: ${tid}`);
      for (const c of CLINICS) {
        const r = report[tid][c];
        if (r.found) {
          console.log(`  * ${c}: FOUND — keys: ${r.keys.join(', ')} — snippet: ${r.snippet}`);
        } else {
          console.log(`  * ${c}: not found`);
        }
      }
    }
    // Also dump full objects for any found in other clinics
    console.log('\nFull objects found:');
    for (const tid of TARGET_IDS) {
      for (const c of CLINICS) {
        const found = await findInClinic(c, tid);
        if (found) {
          console.log(`\n--- ${c} / ${tid} ---`);
          console.log(JSON.stringify(found, null, 2));
        }
      }
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
