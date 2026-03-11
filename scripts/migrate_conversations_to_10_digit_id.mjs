// scripts/migrate_conversations_to_10_digit_id.mjs
// Migra todos os documentos da coleção 'conversations' para IDs de 10 dígitos (removendo o 9 extra)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'whatsapp-server', 'serviceAccountKey.json'))
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function normalizeTo10Digits(id) {
  let digits = String(id).replace(/\D/g, '');
  if (digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === '9') digits = digits.slice(0,2) + digits.slice(3);
  if (digits.length === 10) return digits;
  return null;
}

async function migrateConversations() {
  const convCol = db.collection('conversations');
  const allConvs = await convCol.get();
  let migrated = 0;
  let deleted = 0;

  for (const doc of allConvs.docs) {
    const oldId = doc.id;
    const newId = normalizeTo10Digits(oldId);
    if (!newId || oldId === newId) continue;
    // Copia dados do documento
    const data = doc.data();
    await convCol.doc(newId).set(data, { merge: true });
    // Copia mensagens
    const msgs = await convCol.doc(oldId).collection('messages').get();
    for (const m of msgs.docs) {
      await convCol.doc(newId).collection('messages').doc(m.id).set(m.data(), { merge: true });
    }
    // Deleta documento antigo
    await doc.ref.delete();
    migrated++;
    deleted++;
    console.log(`[MIGRATED] ${oldId} -> ${newId}`);
  }
  console.log(`Migração concluída. Migrados: ${migrated}, Deletados: ${deleted}`);
}

migrateConversations().then(() => process.exit(0));
