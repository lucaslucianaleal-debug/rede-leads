// scripts/migrate_leads_to_10_digit_id.js
// Migra todos os leads para o novo padrão de ID (10 dígitos)

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { readFileSync } = require('fs');

const serviceAccount = JSON.parse(
  readFileSync(require('path').join(__dirname, '../serviceAccountKey.json'))
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function normalizeTo10Digits(phone) {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === '9') digits = digits.slice(0,2) + digits.slice(3);
  if (digits.length === 10) return digits;
  return null;
}

async function migrateLeads() {
  const leadsCol = db.collection('leads');
  const allLeads = await leadsCol.get();
  let migrated = 0;
  let skipped = 0;

  for (const doc of allLeads.docs) {
    const data = doc.data();
    const oldId = doc.id;
    const normalizedId = normalizeTo10Digits(data.telefone || oldId);
    if (!normalizedId) {
      console.log(`[SKIP] Lead inválido: ${oldId}`);
      skipped++;
      continue;
    }
    if (oldId === normalizedId) {
      // Já está correto
      continue;
    }
    // Cria novo doc com ID correto
    const newData = { ...data, id: normalizedId, telefone: normalizedId };
    await leadsCol.doc(normalizedId).set(newData, { merge: true });
    await doc.ref.delete();
    migrated++;
    console.log(`[MIGRATED] ${oldId} -> ${normalizedId}`);
  }
  console.log(`Migração concluída. Migrados: ${migrated}, Ignorados: ${skipped}`);
}

migrateLeads().then(() => process.exit(0));
