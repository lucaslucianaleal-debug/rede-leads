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

(async () => {
  try {
    const docPath = 'clinics/odontocompany-olimpia/shared/shared';
    const docRef = db.doc(docPath);
    const snap = await docRef.get();
    if (!snap.exists) {
      console.error('Document not found:', docPath);
      process.exit(1);
    }
    const data = snap.data() || {};
    const leads = Array.isArray(data.leads) ? data.leads : [];

    const idsToRevert = [
      'lead_1773665871236',
      'lead_1773666612448',
      'lead_1773667039899',
      'lead_1773667237972',
      'lead_1773669160211',
      'lead_1773670575124',
      'lead_1773671113168',
      'lead_1773672697466',
      'lead_1773677159409',
      'lead_1773678052079'
    ];

    // backup pre-change
    const backupsDir = path.resolve(__dirname, '..', 'backups', 'reverts', `revert-${Date.now()}`);
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(path.join(backupsDir, 'pre.json'), JSON.stringify({ docPath, leads }, null, 2));

    let changed = 0;
    const newLeads = leads.map(l => {
      if (idsToRevert.includes(l.id)) {
        const updated = {
          ...l,
          etapaLead: 'Novo',
          followUpCount: 0,
          lastFollowUpDone: todayFormatted,
          dataFollowUp: todayFormatted
        };
        // count if actual change
        if (JSON.stringify(updated) !== JSON.stringify(l)) changed++;
        return updated;
      }
      return l;
    });

    if (changed === 0) {
      console.log('No leads needed reverting.');
      process.exit(0);
    }

    await docRef.set({ leads: newLeads, lastUpdated: new Date().toISOString() }, { merge: true });

    // backup post-change
    fs.writeFileSync(path.join(backupsDir, 'post.json'), JSON.stringify({ docPath, leads: newLeads }, null, 2));

    console.log(`Reverted ${changed} leads in ${docPath}. Backups written to ${backupsDir}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();