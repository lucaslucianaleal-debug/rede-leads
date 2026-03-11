import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const svcPath = new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url);
const serviceAccount = JSON.parse(readFileSync(svcPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function mark(convId) {
  const ref = db.collection('conversations').doc(convId);
  await ref.set({ doNotRecreate: true, deletedAt: new Date().toISOString() }, { merge: true });
  console.log(`Marked ${convId} as doNotRecreate`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/mark_do_not_recreate.js <conversationId>');
    process.exit(1);
  }
  await mark(args[0]);
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
