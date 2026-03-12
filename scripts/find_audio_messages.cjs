const admin = require('firebase-admin');
const serviceAccount = require('../whatsapp-server/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
(async () => {
  const convs = await db.collection('conversations').get();
  for (const c of convs.docs) {
    const msgs = await c.ref.collection('messages').where('body', '>=', '[audio:').get();
    if (!msgs.empty) {
      console.log('conversation', c.id, 'count', msgs.size);
      msgs.forEach(m => console.log('  ', m.id, m.data().body));
    }
  }
})();
