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
  const backupPathArg = process.argv[3] || path.resolve(__dirname, '..', 'backups', 'retro-followups', `${clinicId}-shared-1773373118494.json`);

  if (!fs.existsSync(backupPathArg)) {
    console.error('Backup file not found:', backupPathArg);
    process.exit(1);
  }

  const docPath = `clinics/${clinicId}/shared/shared`;
  console.log('Target doc:', docPath);

  const docRef = db.doc(docPath);

  // Read backup JSON
  const raw = fs.readFileSync(backupPathArg, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse backup JSON:', err);
    process.exit(1);
  }

  const backupData = parsed.data ? parsed.data : parsed;
  const backupLeads = Array.isArray(backupData.leads) ? backupData.leads : [];

  // Backup current doc first
  const snap = await docRef.get();
  const current = snap.exists ? snap.data() : {};
  const currentLeads = Array.isArray(current.leads) ? current.leads : [];
  const backupsDir = path.resolve(__dirname, '..', 'backups', 'clinics', clinicId);
  fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const preFile = path.join(backupsDir, `pre-restore-backup-${ts}.json`);
  fs.writeFileSync(preFile, JSON.stringify(current, null, 2));
  console.log('Wrote pre-restore backup to', preFile);

  // Build map of existing leads by id
  const map = new Map();
  for (const l of currentLeads) {
    if (l && l.id) map.set(l.id, l);
  }

  let added = 0;
  let merged = 0;

  for (const b of backupLeads) {
    if (!b || !b.id) continue;
    const existing = map.get(b.id);
    if (!existing) {
      map.set(b.id, b);
      added++;
    } else {
      const mergedLead = { ...existing };
      for (const key of Object.keys(b)) {
        const val = b[key];
        const isEmpty = val === null || val === undefined || (typeof val === 'string' && val.trim() === '');
        if (!isEmpty) mergedLead[key] = val;
      }
      map.set(b.id, mergedLead);
      merged++;
    }
  }

  const resultLeads = Array.from(map.values());

  // Write merged document (merge true to avoid removing other metadata)
  await docRef.set({ leads: resultLeads, lastUpdated: new Date().toISOString() }, { merge: true });
  console.log('Wrote merged leads to', docPath, ` (added ${added}, merged ${merged}, total ${resultLeads.length})`);

  // Post-restore backup (snapshot after write)
  const postSnap = await docRef.get();
  const postData = postSnap.exists ? postSnap.data() : {};
  const postFile = path.join(backupsDir, `post-restore-backup-${ts}.json`);
  fs.writeFileSync(postFile, JSON.stringify(postData, null, 2));
  console.log('Wrote post-restore backup to', postFile);

  console.log('Restore completed successfully. Please reload app clients to pick up changes.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
