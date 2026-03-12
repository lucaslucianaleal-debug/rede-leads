const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const fs = require('fs');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function sync() {
  try {
    const snap = await db.collection('crm_users').get();
    console.log('crm_users count:', snap.size);
    const backupsDir = 'backups/users-sync';
    fs.mkdirSync(backupsDir, { recursive: true });
    const report = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const uid = doc.id;
      const userDocRef = db.collection('users').doc(uid);
      const userSnap = await userDocRef.get();
      const payload = {
        name: data.name || data.username || data.email || '',
        role: data.role || 'user',
        clinicId: data.clinicId || (Array.isArray(data.clinics) ? data.clinics[0] : null) || null,
        clinics: data.clinics || (data.clinicId ? [data.clinicId] : ['*']),
        createdAt: data.createdAt || new Date().toISOString(),
      };
      if (!userSnap.exists) {
        await userDocRef.set(payload, { merge: true });
        report.push({ uid, action: 'created', payload });
      } else {
        // ensure clinicId present
        const existing = userSnap.data() || {};
        const update = {};
        if (!existing.clinicId && payload.clinicId) update.clinicId = payload.clinicId;
        if (!existing.clinics && payload.clinics) update.clinics = payload.clinics;
        if (Object.keys(update).length > 0) {
          await userDocRef.set(update, { merge: true });
          report.push({ uid, action: 'updated', update });
        } else {
          report.push({ uid, action: 'noop' });
        }
      }
    }
    const out = JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2);
    const path = `${backupsDir}/sync-report-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    fs.writeFileSync(path, out);
    console.log('Sync complete. Report:', path);
  } catch (e) {
    console.error('Sync error:', e);
    process.exit(1);
  }
}

sync().then(()=>process.exit(0));
