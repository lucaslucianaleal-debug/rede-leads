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

async function run() {
  const clinicId = process.argv[2] || 'odontocompany-olimpia';
  const dateArg = process.argv[3]; // format dd/MM/yyyy or 'today'
  const leadIdArg = process.argv[4];

  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayFormatted = `${pad(today.getDate())}/${pad(today.getMonth()+1)}/${today.getFullYear()}`;
  const targetDate = dateArg === 'today' || !dateArg ? todayFormatted : dateArg;

  const docPath = `clinics/${clinicId}/shared/shared`;
  const docRef = db.doc(docPath);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log('Document not found:', docPath);
    process.exit(0);
  }
  const data = snap.data() || {};
  const leads = Array.isArray(data.leads) ? data.leads : [];

  if (leadIdArg) {
    const l = leads.find(x => x.id === leadIdArg);
    if (!l) {
      console.log('Lead not found:', leadIdArg);
    } else {
      console.log(JSON.stringify({ id: l.id, followUpCount: l.followUpCount, lastFollowUpDone: l.lastFollowUpDone, dataFollowUp: l.dataFollowUp, observacao: l.observacao }, null, 2));
    }
    return;
  }

  const matched = leads.filter(l => (l.lastFollowUpDone || '').startsWith(targetDate));
  console.log(`Found ${matched.length} leads with lastFollowUpDone=${targetDate} in ${clinicId}`);
  matched.forEach(l => {
    console.log(JSON.stringify({ id: l.id, followUpCount: l.followUpCount, lastFollowUpDone: l.lastFollowUpDone, dataFollowUp: l.dataFollowUp, observacao: l.observacao }, null, 2));
  });
}

run().catch(err => { console.error(err); process.exit(1); });
