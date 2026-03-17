const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (!process.argv.includes('--confirm')) {
  console.error('DANGEROUS: This script clears ALL leads. Re-run with --confirm to proceed.');
  process.exit(1);
}

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

  const docPath = `clinics/${clinicId}/shared/shared`;
  console.log('Target doc:', docPath);

  const docRef = db.doc(docPath);
  const snap = await docRef.get();
  if (!snap.exists) {
    console.error('Document does not exist:', docPath);
    process.exit(1);
  }

  const data = snap.data() || {};

  // Backup
  const backupsDir = path.resolve(__dirname, '..', 'backups', 'clinics', clinicId);
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupsDir, `shared-backup-full-${ts}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log('Backup written to', backupFile);

  // Clear leads array and update metadata
  await docRef.set({ leads: [], lastUpdated: new Date().toISOString() }, { merge: true });

  console.log(`All leads cleared for clinic: ${clinicId}`);
  console.log('Done. Please reload the app (hard refresh) to pick up changes.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
