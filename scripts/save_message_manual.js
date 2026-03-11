const admin = require('firebase-admin');
const serviceAccount = require('../whatsapp-server/serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const convId = process.argv[2];
  const body = process.argv[3];
  const fromMe = process.argv[4] === 'true';
  const msgId = process.argv[5] || `manual_${Date.now()}`;
  const targetConversation = process.argv[6] || convId;

  const convRef = db.collection('conversations').doc(targetConversation);
  await convRef.collection('messages').doc(msgId).set({
    id: msgId,
    body,
    fromMe,
    timestamp: admin.firestore.Timestamp.now(),
    read: false
  });
  await convRef.set({ lastMessage: body, lastMessageAt: admin.firestore.Timestamp.now() }, { merge: true });
  console.log(`Mensagem salva: ${body} -> ${targetConversation}`);
}

main();
