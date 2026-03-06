import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccountKey = JSON.parse(
  (await import('fs')).readFileSync(resolve(__dirname, 'serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
  databaseURL: 'https://rede-crm-default-rtdb.firebaseio.com'
});

const db = admin.firestore();

console.log('[verify-migration] 🔍 Verificando migração...\n');

try {
  const docRef = db.collection('crm_data').doc('shared');
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    console.log('[verify-migration] ❌ Documento não encontrado');
    process.exit(1);
  }

  const data = docSnap.data();
  const leads = data?.leads || [];

  console.log(`[verify-migration] 📊 Total de leads: ${leads.length}\n`);

  // Contar quantos têm lembretes.sent
  const withSent = leads.filter(l => l.lembretes?.sent && typeof l.lembretes.sent === 'object').length;
  const withoutSent = leads.length - withSent;

  console.log(`[verify-migration] ✅ Leads COM lembretes.sent: ${withSent}`);
  console.log(`[verify-migration] ❌ Leads SEM lembretes.sent: ${withoutSent}\n`);

  if (withoutSent === 0) {
    console.log('[verify-migration] 🎉 SUCESSO! Todos os leads têm lembretes.sent!');
  } else {
    console.log(`[verify-migration] ⚠️  ${withoutSent} leads ainda precisam de migração`);
  }

  // Mostrar exemplo
  const example = leads.find(l => l.lembretes?.sent);
  if (example) {
    console.log(`\n[verify-migration] 📝 Exemplo (${example.nome}):`);
    console.log(JSON.stringify(example.lembretes, null, 2));
  }

  process.exit(0);
} catch (error) {
  console.error('[verify-migration] ❌ Erro:', error.message);
  process.exit(1);
}
