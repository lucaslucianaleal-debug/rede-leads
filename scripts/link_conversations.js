/**
 * Script: link_conversations.js
 * Purpose: find conversation documents in Firestore that are not linked to leads
 * and set `leadId` and `leadNome` when a matching lead is found.
 *
 * Usage:
 * 1. Install firebase-admin: `npm install firebase-admin` (or run from whatsapp-server where deps exist)
 * 2. Set credentials: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 * 3. Dry-run (no writes): `node scripts/link_conversations.js`
 * 4. Apply changes: `node scripts/link_conversations.js --apply`
 */

const admin = require('firebase-admin');

function normalizeToLast11(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 11) return digits.slice(-11);
  return digits;
}

function lastN(phone, n) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= n ? digits.slice(-n) : digits;
}

async function main() {
  const apply = process.argv.includes('--apply');

  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } catch (e) {
    console.error('Failed to initialize firebase-admin. Ensure GOOGLE_APPLICATION_CREDENTIALS is set.');
    console.error(e);
    process.exit(1);
  }

  const db = admin.firestore();

  console.log('Loading leads from crm_data/shared...');
  const sharedRef = db.doc('crm_data/shared');
  const sharedSnap = await sharedRef.get();
  if (!sharedSnap.exists) {
    console.error('crm_data/shared doc not found');
    process.exit(1);
  }
  const leads = sharedSnap.data().leads || [];
  console.log(`Loaded ${leads.length} leads`);

  // Build maps
  const map11 = new Map();
  const map8 = new Map();
  for (const l of leads) {
    const tel = l.telefone || '';
    const n11 = normalizeToLast11(tel);
    const n8 = lastN(tel, 8);
    if (n11) map11.set(n11, l);
    if (n8) map8.set(n8, l);
  }

  console.log('Scanning conversations collection...');
  const convsSnap = await db.collection('conversations').get();
  console.log(`Found ${convsSnap.size} conversations`);

  let matched = 0;
  let updated = 0;

  for (const doc of convsSnap.docs) {
    const id = doc.id;
    const data = doc.data();
    // Skip if already linked
    if (data && (data.leadId || data.leadNome)) continue;

    const digits = id.replace(/\D/g, '');
    const last11 = digits.slice(-11);
    const last8 = digits.slice(-8);

    let lead = null;
    if (last11 && map11.has(last11)) lead = map11.get(last11);
    else if (last8 && map8.has(last8)) lead = map8.get(last8);
    else {
      // Try matching by normalizing leads variants
      for (const [k, l] of map11.entries()) {
        if (k.endsWith(last8)) { lead = l; break; }
      }
    }

    if (lead) {
      matched++;
      console.log(`Match: conversation ${id} -> lead ${lead.id} (${lead.nome})`);
      if (apply) {
        try {
          await db.collection('conversations').doc(id).set({ leadId: lead.id, leadNome: lead.nome }, { merge: true });
          updated++;
        } catch (e) {
          console.error(`Failed to update conversation ${id}:`, e.message || e);
        }
      }
    }
  }

  console.log(`Matched ${matched} conversations. ${apply ? `Updated ${updated}.` : 'Dry-run only.'}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
