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
  const clinicId = process.argv[2] || 'odontocompany-badybassit';
  const removeCount = parseInt(process.argv[3] || '10', 10);

  const docPath = `clinics/${clinicId}/shared/shared`;
  console.log('Target doc:', docPath);

  const docRef = db.doc(docPath);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.error('Document does not exist:', docPath);
    process.exit(1);
  }

  const data = snap.data() || {};
  const leads = Array.isArray(data.leads) ? data.leads : [];

  // Backup
  const backupsDir = path.resolve(__dirname, '..', 'backups', 'clinics', clinicId);
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupsDir, `shared-backup-${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log('Backup written to', backupFile);

  if (leads.length === 0) {
    console.log('No leads found in document. Nothing to remove.');
    process.exit(0);
  }

  const toRemove = Math.min(removeCount, leads.length);
  const remaining = leads.slice(toRemove);

  // Write updated document (merge: false to replace leads array)
  await docRef.set({ leads: remaining, lastUpdated: new Date().toISOString() }, { merge: true });

  console.log(`Removed ${toRemove} lead(s). New leads count: ${remaining.length}`);
  console.log('Done. Please reload the app (hard refresh) to pick up changes.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
