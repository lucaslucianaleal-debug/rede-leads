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

import admin from 'firebase-admin';

// Canonical 10-digit normalizer: remove country code 55 and extra leading 9 when present
function ensure10Digits(phone) {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0,2) + d.slice(3);
  if (d.length >= 10) return d.slice(-10);
  return null;
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

  // Build maps (all possible normalizations)
  const map10 = new Map();
  const map8 = new Map();
  const fullPhones = new Map(); // All variations
  
  for (const l of leads) {
    const tel = l.telefone || '';
    const digits = tel.replace(/\D/g, '');
    
    // Try all last-N variants
    const n10 = ensure10Digits(tel);
    const n8 = lastN(tel, 8);

    if (n10) map10.set(n10, l);
    if (n8) map8.set(n8, l);
    
    // Also try with leading "55" and without
    if (digits) {
      if (!digits.startsWith('55')) fullPhones.set('55' + digits, l);
      fullPhones.set(digits, l);
    }
  }

  console.log('Scanning conversations collection...');
  const convsSnap = await db.collection('conversations').get();
  console.log(`Found ${convsSnap.size} conversations`);

  let matched = 0;
  let updated = 0;
  const unmatched = [];

  for (const doc of convsSnap.docs) {
    const id = doc.id;
    const data = doc.data();
    // Skip if already linked
    if (data && (data.leadId || data.leadNome)) {
      console.log(`  ✓ Already linked: ${id}`);
      continue;
    }

    const digits = id.replace(/\D/g, '');
    const last10 = digits.slice(-10);
    const last9 = digits.slice(-9);
    const last8 = digits.slice(-8);

    let lead = null;

    // Strategy 1: exact digit match (with or without 55)
    if (fullPhones.has(digits)) lead = fullPhones.get(digits);
    if (!lead && !digits.startsWith('55')) {
      const with55 = '55' + digits;
      if (fullPhones.has(with55)) lead = fullPhones.get(with55);
    }

    // Strategy 2: exact 10-digit canonical match
    if (!lead) {
      const as10 = ensure10Digits(digits);
      if (as10 && map10.has(as10)) lead = map10.get(as10);
    }

    // Strategy 3: match by last 8 digits
    if (!lead && last8 && map8.has(last8)) lead = map8.get(last8);
    
    // Strategy 4: search for leads ending with last 8 digits
    if (!lead) {
      for (const [k, l] of map10.entries()) {
        if (k.endsWith(last8)) { lead = l; break; }
      }
    }

    // Strategy 5: search for leads ending with last 9 digits
    if (!lead && last9) {
      for (const [k, l] of map10.entries()) {
        if (k.endsWith(last9)) { lead = l; break; }
      }
    }

    // Strategy 6: search for leads ending with last 10 digits
    if (!lead && last10) {
      for (const [k, l] of map10.entries()) {
        if (k.endsWith(last10)) { lead = l; break; }
      }
    }

    // Strategy 7: try fullPhones map for exact or partial matches
    if (!lead) {
      for (const [phones, l] of fullPhones.entries()) {
        // Match if the conv ID ends with last 8+ digits of a lead phone
        if (phones.endsWith(last8) || phones.slice(-10).endsWith(last9) || phones.slice(-10).endsWith(last10)) {
          lead = l;
          break;
        }
      }
    }

    if (lead) {
      matched++;
      console.log(`✓ Match: conversation ${id} -> lead ${lead.id} (${lead.nome})`);
      if (apply) {
        try {
          await db.collection('conversations').doc(id).set({ leadId: lead.id, leadNome: lead.nome }, { merge: true });
          updated++;
        } catch (e) {
          console.error(`✗ Failed to update conversation ${id}:`, e.message || e);
        }
      }
    } else {
      unmatched.push(id);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Matched ${matched} conversations. ${apply ? `Updated ${updated}.` : 'Dry-run only.'}`);
  console.log(`Unmatched ${unmatched.length} conversations (orphaned):`);
  unmatched.slice(0, 10).forEach(id => console.log(`  - ${id}`));
  if (unmatched.length > 10) console.log(`  ... and ${unmatched.length - 10} more`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
