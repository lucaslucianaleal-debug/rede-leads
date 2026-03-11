import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Load Firebase service account from whatsapp-server/serviceAccountKey.json
const svcPath = new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url);
const serviceAccount = JSON.parse(readFileSync(svcPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function syncConversations(oldConversationId, correctConversationId) {
  const oldMessagesRef = db
    .collection('conversations')
    .doc(oldConversationId)
    .collection('messages');

  const correctMessagesRef = db
    .collection('conversations')
    .doc(correctConversationId)
    .collection('messages');

  const snapshot = await oldMessagesRef.get();

  console.log(`Mensagens encontradas em ${oldConversationId}: ${snapshot.size}`);

  let copied = 0;
  let skipped = 0;
  let removed = 0;

  for (const doc of snapshot.docs) {
    const msgId = doc.id;
    const data = doc.data();

    const exists = await correctMessagesRef.doc(msgId).get();

    if (!exists.exists) {
      await correctMessagesRef.doc(msgId).set(data);
      console.log(`Mensagem sincronizada: ${msgId}`);
      copied++;
    } else {
      console.log(`Mensagem já existe: ${msgId}`);
      skipped++;
    }

    // Após copiar (ou detectar existência), remover do documento antigo
    try {
      await oldMessagesRef.doc(msgId).delete();
      removed++;
    } catch (e) {
      console.warn(`Falha ao remover mensagem antiga ${msgId}:`, e.message || e);
    }
  }

  // Optionally remove the old conversation doc (keeps metadata removal safe)
  try {
    const oldConvRef = db.collection('conversations').doc(oldConversationId);
    const oldConvSnap = await oldConvRef.get();
    if (oldConvSnap.exists) {
      // Remove the document only if no messages remain
      const remaining = await oldMessagesRef.limit(1).get();
      if (remaining.empty) {
        await oldConvRef.delete();
        console.log(`Conversa antiga ${oldConversationId} removida (sem mensagens restantes).`);
      } else {
        console.log(`Conversa antiga ${oldConversationId} ainda possui mensagens; não removida.`);
      }
    }
  } catch (e) {
    console.warn('Falha ao tentar remover doc de conversa antiga:', e.message || e);
  }

  console.log('Sincronização concluída.\n', { copied, skipped, removed });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/sync_conversations.js <oldConversationId> <correctConversationId>');
    process.exit(1);
  }
  const [oldId, newId] = args;
  console.log(`Iniciando sincronização: ${oldId} -> ${newId}`);
  await syncConversations(oldId, newId);
  process.exit(0);
}

main().catch((e) => {
  console.error('Erro:', e && e.stack ? e.stack : e);
  process.exit(1);
});
