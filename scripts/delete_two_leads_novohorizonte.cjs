const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLINIC = 'odontocompany-novohorizonte';
const TARGET_IDS = ['imported-1773317147766-0','imported-1773317147766-1'];

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

    // Backup
    const backupsDir = path.join(__dirname, '..', 'backups', 'delete-tests');
    fs.mkdirSync(backupsDir, { recursive: true });
    const backupPath = path.join(backupsDir, `${CLINIC}-shared-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ backedAt: new Date().toISOString(), data }, null, 2));
    console.log('Backup saved to', backupPath);

    // Remove targets
    const originalCount = leads.length;
    const remaining = leads.filter(l => !TARGET_IDS.includes(l.id || l._id || l.phone || ''));
    const removedCount = originalCount - remaining.length;

    if (removedCount === 0) {
      console.log('No matching leads found to remove. Targets:', TARGET_IDS);
      process.exit(0);
    }

    // Write updated leads array
    await docRef.set({ ...data, leads: remaining }, { merge: true });
    console.log(`Removed ${removedCount} lead(s). New leads count: ${remaining.length}`);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

run();
