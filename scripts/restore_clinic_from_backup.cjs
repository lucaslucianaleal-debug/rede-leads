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
  const backupPathArg = process.argv[3];

  const defaultBackup = path.resolve(__dirname, '..', 'backups', 'fix_resposta', '2026-03-12T21-13-00-343Z', `clinics_odontocompany-olimpia_shared_shared-backup.json`);
  const backupFile = backupPathArg ? path.resolve(process.cwd(), backupPathArg) : defaultBackup;

  if (!fs.existsSync(backupFile)) {
    console.error('Backup file not found:', backupFile);
    process.exit(1);
  }

  const docPath = `clinics/${clinicId}/shared/shared`;
  console.log('Target doc:', docPath);

  const docRef = db.doc(docPath);

  // Read backup JSON
  const raw = fs.readFileSync(backupFile, 'utf8');
  let data;
  try {
    data = JSON.parse(raw).data || JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse backup JSON:', err);
    process.exit(1);
  }

  // Backup current doc first
  const snap = await docRef.get();
  const current = snap.exists ? snap.data() : null;
  const backupsDir = path.resolve(__dirname, '..', 'backups', 'clinics', clinicId);
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const preFile = path.join(backupsDir, `pre-restore-backup-${ts}.json`);
  fs.writeFileSync(preFile, JSON.stringify(current, null, 2));
  console.log('Current document backed up to', preFile);

  // Write backup data to Firestore (overwrite)
  await docRef.set(data);
  console.log('Backup data written to', docPath);

  // Verify
  const after = (await docRef.get()).data();
  const leadsCount = Array.isArray(after.leads) ? after.leads.length : (after.leads ? Object.keys(after.leads).length : 0);
  console.log('Leads count after restore:', leadsCount);
  console.log('Done. Please reload the app (hard refresh) to pick up changes.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
