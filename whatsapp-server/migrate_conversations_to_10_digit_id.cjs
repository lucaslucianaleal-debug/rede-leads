// migrate_conversations_to_10_digit_id.cjs
// Utilitário para migrar subcoleções messages de conversas com IDs sujos para IDs canônicos de 10 dígitos.
// Não sobrescreve mensagens existentes.

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Função copiada do index.js
function normalizeToCanvas(phoneOrId) {
  // Mesma lógica do ensure10Digits: remover prefixo 55 e o '9' extra quando aplicável
  if (!phoneOrId) return null;
  let digits = String(phoneOrId).replace(/@lid|@c\.us/g, "").replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === '9') digits = digits.slice(0,2) + digits.slice(3);
  if (digits.length > 10) digits = digits.slice(-10);
  return digits.length === 10 ? digits : null;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

async function migrateConversations() {
  const conversationsRef = db.collection('conversations');
  const snapshot = await conversationsRef.get();

  for (const doc of snapshot.docs) {
    const dirtyId = doc.id;
    // Identifica IDs sujos
    if (/(@c\.us|@lid|^55)/.test(dirtyId) || dirtyId.length !== 10) {
      const canonicalId = normalizeToCanvas(dirtyId);
      if (!canonicalId || canonicalId.length !== 10) {
        console.log(`[SKIP] Não foi possível normalizar: ${dirtyId}`);
        continue;
      }
      const dirtyMessagesRef = conversationsRef.doc(dirtyId).collection('messages');
      const canonicalMessagesRef = conversationsRef.doc(canonicalId).collection('messages');
      const messagesSnapshot = await dirtyMessagesRef.get();
      for (const msgDoc of messagesSnapshot.docs) {
        const msgId = msgDoc.id;
        const canonicalMsg = await canonicalMessagesRef.doc(msgId).get();
        if (!canonicalMsg.exists) {
          // Copia a mensagem para o doc canônico
          await canonicalMessagesRef.doc(msgId).set(msgDoc.data());
          console.log(`[MOVED] Mensagem ${msgId} de ${dirtyId} para ${canonicalId}`);
        } else {
          console.log(`[SKIP] Mensagem ${msgId} já existe em ${canonicalId}`);
        }
      }
      // Após mover, deleta o doc original
      await conversationsRef.doc(dirtyId).delete();
      console.log(`[DELETE] Documento sujo ${dirtyId} removido.`);
    }
  }
  console.log('Migração concluída.');
}

migrateConversations().catch(console.error);