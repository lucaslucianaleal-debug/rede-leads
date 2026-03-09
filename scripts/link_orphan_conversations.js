/**
 * Link Orphan Conversations to Leads (Advanced)
 * 
 * For conversations that don't have leadNome, tries multiple strategies to find
 * the matching lead by phone number and sets leadNome + leadId.
 * Then consolidates any duplicates that appear.
 * 
 * Usage:
 *   node scripts/link_orphan_conversations.js        # Dry-run
 *   node scripts/link_orphan_conversations.js --apply # Apply linking + consolidation
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Initialize Firebase
const serviceAccountKey = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'whatsapp-server/serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

const db = admin.firestore();
const isApply = process.argv.includes('--apply');

function normalizeToLast11(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 11) return digits.slice(-11);
  return digits;
}

function normalizeToLast10(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function normalizeToLast8(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  return digits;
}

async function linkOrphanConversations() {
  console.log(`Linking orphan conversations to leads (mode: ${isApply ? 'APPLY' : 'DRY-RUN'})...\n`);

  try {
    // Load all leads
    const crmRef = db.collection('crm_data').doc('shared');
    const crmSnap = await crmRef.get();
    const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
    console.log(`Loaded ${leads.length} leads\n`);

    // Load all conversations
    const convSnap = await db.collection('conversations').get();
    const conversations = [];
    convSnap.forEach((doc) => {
      conversations.push({
        id: doc.id,
        data: doc.data(),
      });
    });
    console.log(`Loaded ${conversations.length} conversations\n`);

    // Find orphan conversations (without leadNome)
    const orphans = conversations.filter((c) => !c.data.leadNome || c.data.leadNome.trim() === '');
    console.log(`Found ${orphans.length} orphan conversations\n`);

    let matched = 0;
    let consolidationCandidates = new Map(); // leadNome -> array of conv ids

    // Try to match each orphan to a lead by phone
    for (const orphan of orphans) {
      const convPhone = orphan.data.telefone || orphan.id;
      const convPhoneNorm11 = normalizeToLast11(convPhone);
      const convPhoneNorm10 = normalizeToLast10(convPhone);
      const convPhoneNorm8 = normalizeToLast8(convPhone);

      console.log(`Orphan ${orphan.id} (phone: ${convPhone})`);

      let foundLead = null;

      // Strategy 1: Match by last 11 digits (DDD + number)
      for (const lead of leads) {
        const leadPhoneNorm11 = normalizeToLast11(lead.telefone);
        if (leadPhoneNorm11 === convPhoneNorm11 && leadPhoneNorm11.length === 11) {
          foundLead = lead;
          console.log(`  ✓ Matched by last-11: "${lead.nome}" (${lead.telefone})`);
          break;
        }
      }

      // Strategy 2: Match by last 10 digits (number without DDD)
      if (!foundLead) {
        for (const lead of leads) {
          const leadPhoneNorm10 = normalizeToLast10(lead.telefone);
          if (leadPhoneNorm10 === convPhoneNorm10 && leadPhoneNorm10.length === 10) {
            foundLead = lead;
            console.log(`  ✓ Matched by last-10: "${lead.nome}" (${lead.telefone})`);
            break;
          }
        }
      }

      // Strategy 3: Match by last 8 digits (suffix)
      if (!foundLead) {
        for (const lead of leads) {
          const leadPhoneNorm8 = normalizeToLast8(lead.telefone);
          if (leadPhoneNorm8 === convPhoneNorm8 && leadPhoneNorm8.length === 8) {
            foundLead = lead;
            console.log(`  ✓ Matched by last-8: "${lead.nome}" (${lead.telefone})`);
            break;
          }
        }
      }

      if (foundLead) {
        if (isApply) {
          await db.collection('conversations').doc(orphan.id).update({
            leadNome: foundLead.nome,
            leadId: foundLead.id,
          });
          console.log(`  ✓ Updated conversation with leadNome="${foundLead.nome}", leadId="${foundLead.id}"`);
        } else {
          console.log(`  ✓ Would update with leadNome="${foundLead.nome}", leadId="${foundLead.id}"`);
        }

        // Track for consolidation
        const leadNameKey = String(foundLead.nome).trim().toLowerCase();
        if (!consolidationCandidates.has(leadNameKey)) {
          consolidationCandidates.set(leadNameKey, []);
        }
        consolidationCandidates.get(leadNameKey).push(orphan.id);

        matched++;
      } else {
        console.log(`  ✗ No matching lead found`);
      }
    }

    console.log(`\n=== LINKING SUMMARY ===`);
    console.log(`Orphan conversations linked: ${matched}/${orphans.length}`);

    if (matched > 0 && isApply) {
      console.log(`\n=== CONSOLIDATION PHASE ===\n`);

      // Now consolidate any conversations with the same leadNome
      let consolidatedCount = 0;

      for (const [leadName, convIds] of consolidationCandidates.entries()) {
        if (convIds.length > 1) {
          console.log(`[${leadName}] Found ${convIds.length} conversations to consolidate`);

          // Get the first as main, rest as duplicates
          const mainConvId = convIds[0];
          const duplicateConvIds = convIds.slice(1);

          console.log(`  ✓ Main: ${mainConvId}`);

          for (const dupConvId of duplicateConvIds) {
            console.log(`  → Merging from: ${dupConvId}`);

            try {
              // Get all messages from duplicate
              const messagesSnap = await db
                .collection('conversations')
                .doc(dupConvId)
                .collection('messages')
                .get();

              // Copy to main
              for (const msgDoc of messagesSnap.docs) {
                const targetMsgRef = db
                  .collection('conversations')
                  .doc(mainConvId)
                  .collection('messages')
                  .doc(msgDoc.id);
                const existingMsg = await targetMsgRef.get();
                if (!existingMsg.exists) {
                  if (isApply) {
                    await targetMsgRef.set(msgDoc.data());
                  }
                }
              }

              if (isApply) {
                // Delete duplicate
                await db.collection('conversations').doc(dupConvId).delete();
                console.log(`  ✗ Deleted: ${dupConvId}`);
              } else {
                console.log(`  ✗ Would delete: ${dupConvId}`);
              }
              consolidatedCount++;
            } catch (err) {
              console.error(`  ✗ Error consolidating ${dupConvId}:`, err.message);
            }
          }
        }
      }

      console.log(`\n=== CONSOLIDATION SUMMARY ===`);
      console.log(`Conversations consolidated: ${consolidatedCount}`);
    }

    console.log(`\nMode: ${isApply ? 'APPLIED' : 'DRY-RUN'}`);
    if (!isApply) {
      console.log(`To apply linking and consolidation, run with --apply flag`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await admin.app().delete();
    process.exit(0);
  }
}

linkOrphanConversations();
