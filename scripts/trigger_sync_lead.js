import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { blockIfMissingDoc, blockIfEmptyArray, attachLastWriter } from '../whatsapp-server/lib/crmGuard.mjs';

const phoneArg = process.argv[2];
if (!phoneArg) {
  console.error('Usage: node scripts/trigger_sync_lead.js <phone>');
  process.exit(1);
}
const phone = String(phoneArg).replace(/\D/g, '');

try {
  const serviceAccount = JSON.parse(readFileSync(new URL('../whatsapp-server/serviceAccountKey.json', import.meta.url)));
  initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
  console.error('Failed to init firebase-admin:', e.message || e);
  process.exit(1);
}
const db = getFirestore();

(async () => {
  try {
    const crmRef = db.collection('crm_data').doc('shared');
    const snap = await crmRef.get();
    blockIfMissingDoc(snap, 'trigger_sync_lead.js');
    const leads = snap.data()?.leads || [];
    const norm = phone.startsWith('55') ? phone : `55${phone}`;
    const last11 = norm.replace(/\D/g, '').slice(-10);
    let found = false;
    const updated = leads.map((l) => {
      const ld = String(l.telefone || '').replace(/\D/g, '');
      const llast11 = (ld.startsWith('55') ? ld : `55${ld}`).slice(-10);
      if (llast11 === last11) {
        found = true;
        return { ...l, _triggeredAt: Date.now() };
      }
      return l;
    });
    if (!found) {
      console.error('Lead not found for', phone);
      process.exit(1);
    }
    blockIfEmptyArray(updated, 'trigger_sync_lead.js');
    await crmRef.update(attachLastWriter({ leads: updated }, 'trigger_sync_lead.js', 'trigger_sync_lead'));
    console.log('Triggered sync for lead with suffix', last11);
  } catch (e) {
    console.error('Error triggering sync:', e.message || e);
    process.exit(1);
  }
  process.exit(0);
})();
