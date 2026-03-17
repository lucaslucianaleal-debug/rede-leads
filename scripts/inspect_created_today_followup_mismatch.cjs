const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const svcPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(svcPath)) {
  console.error('serviceAccountKey.json not found at', svcPath);
  process.exit(1);
}

const svc = require(svcPath);
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const pad = (n) => String(n).padStart(2, '0');
const today = new Date();
const todayFormatted = `${pad(today.getDate())}/${pad(today.getMonth()+1)}/${today.getFullYear()}`;

async function inspectDoc(docPath, label) {
  const docRef = db.doc(docPath);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log(`${label}: doc not found: ${docPath}`);
    return;
  }
  const data = snap.data() || {};
  const leads = Array.isArray(data.leads) ? data.leads : [];
  const matched = leads.filter(l => (l.dataCriacao || '').startsWith(todayFormatted) && (l.dataFollowUp || '') !== todayFormatted);
  console.log(`${label}: found ${matched.length} leads created today with dataFollowUp!=${todayFormatted} (doc: ${docPath})`);
  matched.forEach(l => {
    console.log(JSON.stringify({ id: l.id, followUpCount: l.followUpCount, dataCriacao: l.dataCriacao, dataFollowUp: l.dataFollowUp, observacao: l.observacao }, null, 2));
  });
}

(async () => {
  await inspectDoc('clinics/odontocompany-olimpia/shared/shared', 'odontocompany-olimpia');
  await inspectDoc('crm_data/shared', 'crm_data/shared');
})();