import { readFileSync } from 'fs';
import admin from 'firebase-admin';

try {
  const svc = JSON.parse(readFileSync(new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url)));
  admin.initializeApp({ credential: admin.credential.cert(svc) });
} catch (e) {
  console.error('failed to init firebase-admin:', e);
  process.exit(1);
}
const db = admin.firestore();

const term = process.argv[2];
if (!term) {
  console.error('Usage: node scripts/find_by_name_or_phone.js <term>');
  process.exit(1);
}
const digits = term.replace(/\D/g, '');
(async () => {
  try {
    const snaps = await db.collection('conversations').get();
    const matches = [];
    for (const d of snaps.docs) {
      const id = d.id;
      const data = d.data() || {};
      const tel = String(data.telefone || '');
      const nome = String(data.leadNome || data.leadNome || '');
      if (id.includes(digits) || tel.includes(digits) || (nome && nome.toLowerCase().includes(term.toLowerCase()))) {
        matches.push({ id, telefone: tel, leadNome: nome, lastMessage: data.lastMessage || null });
      }
    }
    console.log('Found', matches.length, 'matching conversations:');
    for (const m of matches) console.log(JSON.stringify(m));
  } catch (e) {
    console.error('err', e);
  }
  process.exit(0);
})();
