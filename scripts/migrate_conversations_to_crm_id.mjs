import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// ===== CONFIGURAÇÃO DE CREDENCIAL =====
const SERVICE_ACCOUNT_PATH = path.resolve('./serviceAccountKey.json'); // Altere se necessário
let serviceAccount = null;
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  try {
    const json = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
    serviceAccount = JSON.parse(json);
  } catch (e) {
    console.error('Erro ao ler/parsear serviceAccountKey.json:', e.message);
  }
}

// ===== CONFIGURAÇÕES =====
const DRY_RUN = false; // Altere para false para executar de verdade
const DIAGNOSE_PATH = path.resolve('./whatsapp-server/diagnose_report.json');
const COLLECTION = 'conversations';
const SUBCOLLECTION = 'messages';

// ===== INICIALIZAÇÃO FIREBASE =====
if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
}
const db = admin.firestore();

// ===== FUNÇÕES AUXILIARES =====
async function migrateConversation({ oldId, newId, crmName }) {
  const oldRef = db.collection(COLLECTION).doc(oldId);
  const newRef = db.collection(COLLECTION).doc(newId);

  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) {
    console.log(`[Ignorado] Documento antigo não existe: ${oldId}`);
    return;
  }

  const oldData = oldSnap.data();
  // Copia todos os campos, mas sobrescreve nome
  const newData = { ...oldData, nome: crmName };

  // Copiar subcoleção messages
  const messagesSnap = await oldRef.collection(SUBCOLLECTION).get();
  const batch = db.batch();

  batch.set(newRef, newData);

  messagesSnap.forEach((msgDoc) => {
    const msgData = msgDoc.data();
    const newMsgRef = newRef.collection(SUBCOLLECTION).doc(msgDoc.id);
    batch.set(newMsgRef, msgData);
  });

  if (DRY_RUN) {
    console.log(`[DRY_RUN] Migraria ${oldId} -> ${newId} (${messagesSnap.size} mensagens)`);
    return;
  }

  // Commit da cópia
  await batch.commit();

  // Deletar mensagens antigas em lotes (Firestore não remove subcoleções automaticamente)
  try {
    const msgs = messagesSnap.docs;
    const chunkSize = 400; // abaixo do limite de 500
    for (let i = 0; i < msgs.length; i += chunkSize) {
      const chunk = msgs.slice(i, i + chunkSize);
      const delBatch = db.batch();
      chunk.forEach((d) => delBatch.delete(oldRef.collection(SUBCOLLECTION).doc(d.id)));
      await delBatch.commit();
    }
  } catch (e) {
    console.error(`[Erro] Falha ao deletar mensagens antigas de ${oldId}:`, e);
  }

  // Deletar documento antigo
  await oldRef.delete();
  console.log(`[Migrado] ${oldId} -> ${newId} (${messagesSnap.size} mensagens)`);
}

// ===== SCRIPT PRINCIPAL =====
async function main() {
  const raw = fs.readFileSync(DIAGNOSE_PATH, 'utf8');
  const report = JSON.parse(raw);

  let count = 0;
  const leads = report.crmDataLeads || [];
  for (const lead of leads) {
    // lead = { id, nome, telefone_raw, telefone_norm, last10 }
    const crmId = lead.telefone_norm;
    const oldId = lead.last10;
    const crmName = lead.nome;

    if (!crmId || !oldId) {
      console.log(`[Erro] Dados insuficientes para migrar: ${JSON.stringify(lead)}`);
      continue;
    }
    if (crmId === oldId) {
      console.log(`[Ignorado] IDs já coincidem: ${crmId}`);
      continue;
    }
    try {
      await migrateConversation({ oldId, newId: crmId, crmName });
      count++;
    } catch (e) {
      console.error(`[Erro] Falha ao migrar ${oldId} -> ${crmId}:`, e);
    }
  }
  console.log(`Processo concluído. Total processados: ${count}`);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
