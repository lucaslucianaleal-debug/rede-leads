const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../whatsapp-server/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MEDIA_DIR = path.join(__dirname, '..', 'whatsapp-server', 'media');

function sanitize(name) {
  return name.replace(/[^0-9a-zA-Z._-]/g, '');
}

async function main() {
  const convs = await db.collection('conversations').get();
  for (const conv of convs.docs) {
    const msgs = await conv.ref.collection('messages').get();
    for (const m of msgs.docs) {
      const data = m.data();
      if (typeof data.body === 'string' && data.body.startsWith('[audio:')) {
        const token = data.body.slice(7, -1);
        if (token.includes('@')) {
          // also drop any _lid_ suffix so filenames are shorter
        let clean = sanitize(token);
        clean = clean.replace(/_lid_[A-Za-z0-9]+/, '');
        const oldPath = path.join(MEDIA_DIR, token);
        const newPath = path.join(MEDIA_DIR, clean);
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
          fs.renameSync(oldPath, newPath);
          console.log(`renamed file ${token} -> ${clean}`);
        }
        await m.ref.update({ body: `[audio:${clean}]` });
          console.log(`updated message ${m.id} in ${conv.id}`);
        }
      }
    }
  }
  console.log('done');
}

main().catch(console.error);
