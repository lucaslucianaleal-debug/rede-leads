// scripts/migrate_leads_to_10_digit_id.mjs
// Migra todos os leads para o novo padrão de ID (10 dígitos)

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

// Normaliza estritamente para 10 dígitos removendo o '9' extra se presente
function normalizeTo10Digits(phone) {
  let digits = String(phone).replace(/\D/g, '');
  // remove country code 55 se presente
  if (digits.startsWith('55')) digits = digits.slice(2);
  // Se já for 10 dígitos, retorna
  if (digits.length === 10) return digits;
  // Se for 11 dígitos e possui '9' na terceira posição, remove o '9'
  if (digits.length === 11 && digits[2] === '9') {
    return digits.slice(0,2) + digits.slice(3);
  }
  // qualquer outro caso: não normaliza
  return null;
}

async function migrateLeads() {
  const leadsCol = db.collection('leads');
  const allLeads = await leadsCol.get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of allLeads.docs) {
    const data = doc.data();
    const oldId = String(doc.id).replace(/\D/g, '');

    // Só atuar quando o documento tiver 11 dígitos e for do tipo com '9' na 3ª posição
    if (oldId.length === 11 && oldId[2] === '9') {
      const newId = oldId.slice(0,2) + oldId.slice(3); // remove o '9'
      // Cria/merge novo documento com ID de 10 dígitos
      const newData = { ...data, id: newId, telefone: newId };
      await leadsCol.doc(newId).set(newData, { merge: true });
      // Copiar subcoleções se houver (não comum em leads, mas por segurança)
      const subcols = await doc.ref.listCollections();
      for (const sc of subcols) {
        const docs = await sc.get();
        for (const sd of docs.docs) {
          await leadsCol.doc(newId).collection(sc.id).doc(sd.id).set(sd.data(), { merge: true });
        }
      }
      // Deleta o documento antigo de 11 dígitos
      await doc.ref.delete();
      migrated++;
      console.log(`[MIGRATED] ${oldId} -> ${newId}`);
    } else {
      // Não altera documentos que já estão em 10 dígitos ou formatos inesperados
      skipped++;
    }
  }
  console.log(`Migração concluída. Migrados: ${migrated}, Ignorados: ${skipped}`);
}

migrateLeads().then(() => process.exit(0));
