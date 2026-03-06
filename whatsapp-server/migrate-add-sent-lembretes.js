import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
const serviceAccountKey = JSON.parse(
  (await import('fs')).readFileSync(resolve(__dirname, 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  databaseURL: 'https://rede-crm-default-rtdb.firebaseio.com'
});

const db = admin.firestore();
const DRY_RUN = !process.argv.includes('--apply');

console.log(`[migrate-add-sent-lembretes] ${DRY_RUN ? 'DRY RUN' : 'APPLY MODE'}`);
console.log('[migrate-add-sent-lembretes] Carregando leads de crm_data/shared...\n');

try {
  const docRef = db.collection('crm_data').doc('shared');
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    console.log('[migrate-add-sent-lembretes] ❌ Documento crm_data/shared não encontrado!');
    process.exit(1);
  }

  const data = docSnap.data();
  const leads = data?.leads || [];

  console.log(`[migrate-add-sent-lembretes] 📊 Total de leads: ${leads.length}`);

  // Contar quantos faltam lembretes.sent
  const needsMigration = leads.filter(
    l => !l.lembretes?.sent || typeof l.lembretes.sent !== 'object'
  ).length;

  console.log(`[migrate-add-sent-lembretes] 🔄 Leads que precisam de migrate: ${needsMigration}\n`);

  // Adicionar lembretes.sent onde falta
  const migratedLeads = leads.map(l => {
    if (!l.lembretes) {
      l.lembretes = { h24: false, today: false };
    }
    if (!l.lembretes.sent || typeof l.lembretes.sent !== 'object') {
      l.lembretes.sent = {
        '24h': null,
        '12h': null,
        '3h': null,
        '1h': null
      };
      console.log(`[migrate-add-sent-lembretes] ✅ ${l.nome} (${l.telefone}) - lembretes.sent criado`);
    } else {
      console.log(`[migrate-add-sent-lembretes] ⏭️  ${l.nome} (${l.telefone}) - já possui lembretes.sent`);
    }
    return l;
  });

  console.log(`\n[migrate-add-sent-lembretes] 💾 Escrevendo de volta...`);

  if (DRY_RUN) {
    console.log('[migrate-add-sent-lembretes] 🔒 DRY RUN: Nenhuma alteração no Firebase.');
    console.log(`[migrate-add-sent-lembretes] Se estiver satisfeito, execute com: node migrate-add-sent-lembretes.js --apply`);
  } else {
    await docRef.set({ leads: migratedLeads, lastUpdated: new Date().toISOString() }, { merge: true });
    console.log('[migrate-add-sent-lembretes] ✅ Migração aplicada com sucesso!');
  }

  process.exit(0);
} catch (error) {
  console.error('[migrate-add-sent-lembretes] ❌ Erro:', error.message);
  process.exit(1);
}
