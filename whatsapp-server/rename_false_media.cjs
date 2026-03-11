const { readdirSync, statSync, renameSync, existsSync } = require('fs');
const { join } = require('path');
const admin = require('firebase-admin');

const svc = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const MEDIA_DIR = join(__dirname, 'media');

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

(async () => {
  try {
    if (!existsSync(MEDIA_DIR)) {
      console.log('[rename] media dir not found, exiting');
      process.exit(0);
    }
    const files = readdirSync(MEDIA_DIR).filter(n => n.startsWith('false_'));
    if (files.length === 0) {
      console.log('[rename] no files starting with false_ found');
      process.exit(0);
    }
    const renameMap = {};
    for (const f of files) {
      const old = f;
      // remove leading false_ and any following separators
      let candidate = f.replace(/^false_+/, '');
      candidate = safeName(candidate);
      // ensure unique
      let nf = candidate;
      let i = 1;
      while (existsSync(join(MEDIA_DIR, nf))) {
        nf = candidate.replace(/(\.[^.]+)?$/, `_${i}$1`);
        i++;
      }
      renameSync(join(MEDIA_DIR, old), join(MEDIA_DIR, nf));
      renameMap[old] = nf;
      console.log('[rename] renamed', old, '->', nf);
    }

    // update Firestore messages
    const convs = await db.collection('conversations').get();
    let updated = 0;
    for (const conv of convs.docs) {
      const msgsRef = db.collection('conversations').doc(conv.id).collection('messages');
      const msgs = await msgsRef.get();
      for (const m of msgs.docs) {
        const data = m.data();
        if (!data || !data.body || typeof data.body !== 'string') continue;
        let body = data.body;
        let changed = false;
        for (const [oldName, newName] of Object.entries(renameMap)) {
          if (body.includes(oldName)) {
            body = body.split(oldName).join(newName);
            changed = true;
          }
        }
        if (changed) {
          await msgsRef.doc(m.id).update({ body });
          updated++;
          console.log('[rename] updated message', m.id, 'in', conv.id);
        }
      }
    }

    console.log('[rename] completed. files:', Object.keys(renameMap).length, 'messages updated:', updated);
    process.exit(0);
  } catch (e) {
    console.error('[rename] error', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
