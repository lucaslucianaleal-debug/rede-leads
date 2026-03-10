import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/find_conversations.js <suffix>');
  process.exit(1);
}

const suffix = String(arg).replace(/\D/g, '').slice(-11);
try {
  const serviceAccount = JSON.parse(readFileSync(new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url)));
  initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
  console.error('Failed to init firebase-admin:', e.message || e);
  process.exit(1);
}
const db = getFirestore();

(async () => {
  console.log('Searching conversations for suffix:', suffix);
  try {
    const snaps = await db.collection('conversations').get();
    const matches = [];
    for (const doc of snaps.docs) {
      const idLast = doc.id.replace(/\D/g, '').slice(-11);
      const telField = String(doc.data()?.telefone || '').replace(/\D/g, '').slice(-11);
      if (idLast === suffix || telField === suffix) {
        matches.push({ id: doc.id, data: doc.data() });
      }
    }
    if (matches.length === 0) {
      console.log('No conversations matched the suffix.');
    } else {
      console.log('Matches:', matches.length);
      for (const m of matches) {
        console.log('---');
        console.log('id:', m.id);
        console.log('telefone:', m.data.telefone || '(none)');
        console.log('leadId:', m.data.leadId || '(none)');
        console.log('leadNome:', m.data.leadNome || '(none)');
        console.log('lastMessage:', m.data.lastMessage || '(none)');
        console.log('lastMessageAt:', m.data.lastMessageAt || '(none)');
      }
    }
  } catch (e) {
    console.error('Error querying conversations:', e.message || e);
  }
  process.exit(0);
})();
