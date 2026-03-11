const { readdirSync, renameSync, existsSync, statSync } = require('fs');
const { join } = require('path');
const admin = require('firebase-admin');

// Load service account
const svc = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const MEDIA_DIR = join(__dirname, 'media');
const TARGET_NUM = '5517997791492'; // Célia (full)

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

(async () => {
  try {
    if (!existsSync(MEDIA_DIR)) {
      console.error('[repair] media dir not found:', MEDIA_DIR);
      process.exit(1);
    }
    // Build broad search patterns: full with country, without country, last 10/9/8 digits
    const variants = new Set();
    const full = TARGET_NUM.replace(/\D/g, '');
    variants.add(full);
    if (full.startsWith('55')) variants.add(full.slice(2));
    if (full.length >= 10) variants.add(full.slice(-10));
    if (full.length >= 9) variants.add(full.slice(-9));
    if (full.length >= 8) variants.add(full.slice(-8));
    // Also include versions that might appear with "false_" or @c.us parts
    const files = readdirSync(MEDIA_DIR).filter(n => {
      for (const v of variants) {
        if (!v) continue;
        if (n.includes(v)) return true;
        // some filenames embed @c.us or other separators
        const compact = n.replace(/[^0-9]/g, '');
        if (compact.includes(v)) return true;
      }
      return false;
    });
    if (files.length === 0) {
      console.log('[repair] No media files found for', TARGET_NUM);
    }

    const renameMap = {};
    for (const f of files) {
      const oldPath = join(MEDIA_DIR, f);
      const st = statSync(oldPath);
      if (!st.isFile()) continue;
      const nfBase = safeName(f);
      let nf = nfBase;
      let i = 1;
      while (existsSync(join(MEDIA_DIR, nf))) {
        nf = nfBase.replace(/(\.[^.]+)?$/, `_${i}$1`);
        i++;
      }
      if (nf !== f) {
        const newPath = join(MEDIA_DIR, nf);
        renameSync(oldPath, newPath);
        renameMap[f] = nf;
        console.log('[repair] Renamed', f, '->', nf);
      } else {
        console.log('[repair] Already safe:', f);
      }
    }

    if (Object.keys(renameMap).length === 0) {
      console.log('[repair] No renames necessary. Exiting.');
      process.exit(0);
    }

    // Now update Firestore messages bodies that reference old filenames
    console.log('[repair] Scanning conversations to update message bodies...');
    const convs = await db.collection('conversations').get();
    let updatedMsgs = 0;
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
          updatedMsgs++;
          console.log('[repair] Updated message', m.id, 'in conv', conv.id);
        }
      }
    }

    console.log(`[repair] Completed. Files renamed: ${Object.keys(renameMap).length}, messages updated: ${updatedMsgs}`);
    process.exit(0);
  } catch (e) {
    console.error('[repair] Error:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
