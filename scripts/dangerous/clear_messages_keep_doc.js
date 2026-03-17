import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.argv.includes('--confirm')) {
  console.error('DANGEROUS: This script clears messages. Re-run with --confirm to proceed.');
  process.exit(1);
}

const svcPath = new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url);
const serviceAccount = JSON.parse(readFileSync(svcPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function clearMessages(convId) {
  const msgsRef = db.collection('conversations').doc(convId).collection('messages');

  let deleted = 0;
  while (true) {
    const snap = await msgsRef.limit(500).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    console.log(`Removidos ${snap.size} mensagens (total removidas: ${deleted})`);
  }

  // Clear metadata but keep doNotRecreate marker
  const convRef = db.collection('conversations').doc(convId);
  await convRef.set({ lastMessage: '', lastMessageAt: null, unreadCount: 0 }, { merge: true });
  console.log(`Conversa ${convId} limpa (mensagens removidas, doc mantido).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/clear_messages_keep_doc.js <conversationId> --confirm');
    process.exit(1);
  }
  await clearMessages(args[0]);
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
