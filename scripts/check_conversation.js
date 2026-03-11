import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const svcPath = new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url);
const serviceAccount = JSON.parse(readFileSync(svcPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function checkConversation(convId) {
  console.log(`Checking conversation: ${convId}`);
  const convRef = db.collection('conversations').doc(convId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    console.log(`Conversation ${convId} does NOT exist.`);
  } else {
    console.log(`Conversation ${convId} exists. Data:` , convSnap.data());
    const msgs = await convRef.collection('messages').limit(5).get();
    console.log(`Sample messages count: ${msgs.size}`);
    msgs.docs.forEach(d => console.log('-', d.id, d.data()));
  }

  // Check by canonical 10-digit match across conversations
  const last10 = (convId && convId.replace(/\D/g, '').slice(-10)) || null;
  if (last10 && last10.length === 10) {
    console.log(`Searching by canonical10: ${last10}`);
    const all = await db.collection('conversations').get();
    const matches = all.docs.filter(d => {
      const id10 = d.id.replace(/\D/g, '').slice(-10);
      const telField = String(d.data()?.telefone || '').replace(/\D/g, '').slice(-10);
      return id10 === last10 || telField === last10;
    });
    console.log(`Found ${matches.length} conversations matching canonical10:`);
    matches.forEach(d => console.log('-', d.id, d.data()));
  }

  // Check crm_data.shared leads for references
  const crmRef = db.collection('crm_data').doc('shared');
  const crmSnap = await crmRef.get();
  const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
  const leadMatches = leads.filter(l => {
    const d = String(l.telefone || '').replace(/\D/g, '');
    return d.includes(convId.replace(/\D/g, '')) || d.endsWith(convId.replace(/\D/g, '').slice(-8));
  });
  console.log(`Leads matching phone fragment: ${leadMatches.length}`);
  leadMatches.forEach(l => console.log('-', l.id, l.nome, l.telefone));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/check_conversation.js <conversationId>');
    process.exit(1);
  }
  const [convId] = args;
  await checkConversation(convId);
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
