const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function migrate(clinicId) {
  try {
    const srcRef = db.collection('crm_data').doc('shared');
    const srcSnap = await srcRef.get();
    if (!srcSnap.exists) {
      console.log('Source crm_data/shared not found');
      return;
    }
    const src = srcSnap.data();
    const leads = Array.isArray(src.leads) ? src.leads : [];
    console.log(`Found ${leads.length} leads in crm_data/shared`);

    const backupsDir = path.resolve(__dirname, '..', 'backups', 'clinics', clinicId);
    fs.mkdirSync(backupsDir, { recursive: true });
    const beforePath = path.join(backupsDir, `shared-backup-before-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);

    // Read existing clinic doc
    const clinicRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
    const clinicSnap = await clinicRef.get();
    const clinicData = clinicSnap.exists ? clinicSnap.data() : null;

    // Backup existing clinic doc
    fs.writeFileSync(beforePath, JSON.stringify({ clinicData, srcLeadsCount: leads.length, migratedAt: new Date().toISOString() }, null, 2));
    console.log('Wrote backup to', beforePath);

    // Write leads into clinic shared doc (merge)
    await clinicRef.set({ leads, lastUpdated: new Date().toISOString() }, { merge: true });
    console.log(`Migrated ${leads.length} leads -> clinics/${clinicId}/shared/shared`);

    // confirm
    const newSnap = await clinicRef.get();
    const newLeads = Array.isArray(newSnap.data()?.leads) ? newSnap.data().leads.length : 0;
    console.log('Destination now has leads=', newLeads);
  } catch (e) {
    console.error('Migration error:', e);
    process.exit(1);
  }
}

const clinic = process.argv[2] || 'odontocompany-novohorizonte';
migrate(clinic).then(()=>process.exit(0));
