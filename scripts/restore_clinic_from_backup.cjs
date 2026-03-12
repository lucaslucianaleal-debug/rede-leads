const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function restore(clinicId, backupFile) {
  try {
    const content = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    const clinicData = content.clinicData || null;

    const clinicRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');

    if (!clinicData) {
      // delete doc if clinicData was null
      await clinicRef.delete();
      console.log(`Restored: deleted clinics/${clinicId}/shared/shared (was empty)`);
      return;
    }

    await clinicRef.set(clinicData, { merge: false });
    console.log(`Restored clinics/${clinicId}/shared/shared from ${path.basename(backupFile)}`);
  } catch (e) {
    console.error('Restore error:', e);
    process.exit(1);
  }
}

const clinic = process.argv[2] || 'odontocompany-novohorizonte';
const backup = process.argv[3] || `backups/clinics/${clinic}/shared-backup-before-2026-03-12T18-46-00-306Z.json`;
restore(clinic, backup).then(()=>process.exit(0));
