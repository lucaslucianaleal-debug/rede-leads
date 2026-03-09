import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccountKey = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'whatsapp-server/serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

const db = admin.firestore();
const isApply = process.argv.includes('--apply');

// Manual mappings based on user identification
const manualLinks = [
  {
    convId: '27569776764',
    leadName: 'Rafaela de Souza Santana',
    leadId: null, // Will be found by name
  },
  {
    convId: '85563988191',
    leadName: 'Sill Cristofoli',
    leadId: null,
  },
  {
    convId: '58178613382',
    leadName: 'Marina Siconelle',
    leadId: null,
  },
];

async function linkManualMappings() {
  console.log(`Manual linking of orphan conversations (mode: ${isApply ? 'APPLY' : 'DRY-RUN'})...\n`);

  try {
    // Load all leads
    const crmRef = db.collection('crm_data').doc('shared');
    const crmSnap = await crmRef.get();
    const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];

    // Resolve lead IDs by name
    for (const mapping of manualLinks) {
      const lead = leads.find(l => 
        String(l.nome || '').toLowerCase() === mapping.leadName.toLowerCase()
      );
      if (lead) {
        mapping.leadId = lead.id;
      }
    }

    // Apply mappings
    let updated = 0;
    for (const mapping of manualLinks) {
      if (mapping.leadId) {
        console.log(`✓ ${mapping.convId} -> ${mapping.leadName} (${mapping.leadId})`);
        if (isApply) {
          await db.collection('conversations').doc(mapping.convId).update({
            leadNome: mapping.leadName,
            leadId: mapping.leadId,
          });
          console.log(`  Updated in Firestore`);
        } else {
          console.log(`  Would update in Firestore`);
        }
        updated++;
      } else {
        console.log(`✗ ${mapping.convId} -> "${mapping.leadName}" NOT FOUND in CRM`);
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Updated: ${updated}/${manualLinks.length}`);
    console.log(`Mode: ${isApply ? 'APPLIED' : 'DRY-RUN'}`);

    if (!isApply) {
      console.log(`To apply, run with --apply flag`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await admin.app().delete();
  }
}

linkManualMappings();
