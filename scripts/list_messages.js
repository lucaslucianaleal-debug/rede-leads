import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const conv = process.argv[2];
if (!conv) {
  console.error('Usage: node scripts/list_messages.js <conversationId>');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(readFileSync(new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url)));
  initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
  console.error('Failed to init firebase-admin:', e.message || e);
  process.exit(1);
}
const db = getFirestore();

(async () => {
  try {
    const msgsRef = db.collection('conversations').doc(conv).collection('messages');
    const snaps = await msgsRef.orderBy('timestamp', 'desc').limit(50).get();
    if (snaps.empty) {
      console.log('No messages found for conversation', conv);
    } else {
      console.log(`Messages for ${conv}: ${snaps.size}`);
      for (const d of snaps.docs) {
        const data = d.data();
        console.log('---');
        console.log('id:', d.id);
        console.log('fromMe:', data.fromMe);
        console.log('body:', data.body);
        console.log('timestamp:', data.timestamp);
      }
    }
  } catch (e) {
    console.error('Error listing messages:', e.message || e);
  }
  process.exit(0);
})();
