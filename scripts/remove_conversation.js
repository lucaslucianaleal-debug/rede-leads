import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Load Firebase service account
const svcPath = new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url);
const serviceAccount = JSON.parse(readFileSync(svcPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function removeConversation(conversationId) {
  const msgsRef = db.collection('conversations').doc(conversationId).collection('messages');

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

  // delete conversation doc
  try {
    const convRef = db.collection('conversations').doc(conversationId);
    const convSnap = await convRef.get();
    if (convSnap.exists) {
      await convRef.delete();
      console.log(`Conversa ${conversationId} removida.`);
    } else {
      console.log(`Conversa ${conversationId} não existe.`);
    }
  } catch (e) {
    console.error('Erro ao remover conversa:', e.message || e);
  }

  console.log('Remoção concluída.', { deleted });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/remove_conversation.js <conversationId>');
    process.exit(1);
  }
  const [convId] = args;
  await removeConversation(convId);
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
