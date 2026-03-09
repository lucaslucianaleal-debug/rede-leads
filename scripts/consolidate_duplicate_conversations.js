/**
 * Consolidate Duplicate Conversations
 * 
 * Finds conversations with the same leadNome or leadId and merges them into one.
 * After merging, deletes the duplicate conversation documents.
 * 
 * Usage:
 *   npm run consolidate-convs        # Dry-run (shows what would be merged)
 *   npm run consolidate-convs --apply # Actually merge and delete
 * 
 * This helps clean up the Conversations tab when the same contact has multiple conversation docs.
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

async function consolidateDuplicateConversations() {
  console.log(`Consolidating duplicate conversations (mode: ${isApply ? 'APPLY' : 'DRY-RUN'})...\n`);

  try {
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

    // Group by leadNome (primary) and leadId (secondary)
    const groupsByName = {};
    const groupsById = {};

    for (const conv of conversations) {
      const leadNome = conv.data.leadNome ? String(conv.data.leadNome).trim().toLowerCase() : null;
      const leadId = conv.data.leadId ? String(conv.data.leadId).trim() : null;

      // Group by leadNome
      if (leadNome && leadNome.length > 2) {
        if (!groupsByName[leadNome]) {
          groupsByName[leadNome] = [];
        }
        groupsByName[leadNome].push(conv);
      }

      // Group by leadId
      if (leadId && leadId.length > 0) {
        if (!groupsById[leadId]) {
          groupsById[leadId] = [];
        }
        groupsById[leadId].push(conv);
      }
    }

    // Find groups with duplicates (more than 1 conversation with the same name/id)
    const duplicateGroups = [];

    for (const [name, convs] of Object.entries(groupsByName)) {
      if (convs.length > 1) {
        duplicateGroups.push({
          type: 'leadNome',
          key: name,
          conversations: convs,
        });
      }
    }

    for (const [id, convs] of Object.entries(groupsById)) {
      if (convs.length > 1) {
        // Check if already in duplicateGroups
        const alreadyAdded = duplicateGroups.some(
          (g) => g.type === 'leadId' && g.key === id
        );
        if (!alreadyAdded) {
          duplicateGroups.push({
            type: 'leadId',
            key: id,
            conversations: convs,
          });
        }
      }
    }

    console.log(`Found ${duplicateGroups.length} groups with duplicates\n`);

    let totalMerged = 0;
    let totalDeleted = 0;

    // Process each duplicate group
    for (const group of duplicateGroups) {
      const { type, key, conversations: convs } = group;
      console.log(`\n[${type}] ${key} (${convs.length} conversations)`);
      
      // Sort by the number of messages (keep the one with most messages)
      convs.sort(async (a, b) => {
        try {
          const aCount = (await db.collection('conversations').doc(a.id).collection('messages').count().get()).data().count || 0;
          const bCount = (await db.collection('conversations').doc(b.id).collection('messages').count().get()).data().count || 0;
          return bCount - aCount;
        } catch {
          return 0;
        }
      });

      const mainConv = convs[0]; // Keep this one
      const duplicateConvs = convs.slice(1); // Merge these into main

      console.log(`  ✓ Main conversation: ${mainConv.id}`);

      // Merge messages from duplicates into main
      for (const dupConv of duplicateConvs) {
        console.log(`  → Merging from: ${dupConv.id}`);

        try {
          // Get all messages from duplicate
          const messagesSnap = await db
            .collection('conversations')
            .doc(dupConv.id)
            .collection('messages')
            .get();

          // Copy messages to main conversation
          for (const msgDoc of messagesSnap.docs) {
            const msgData = msgDoc.data();
            // Use same msgId to avoid duplicates, or generate new one if needed
            const targetMsgRef = db
              .collection('conversations')
              .doc(mainConv.id)
              .collection('messages')
              .doc(msgDoc.id);

            const existingMsg = await targetMsgRef.get();
            if (!existingMsg.exists) {
              if (isApply) {
                await targetMsgRef.set(msgData);
              }
            }
          }

          if (isApply) {
            // Update main conversation's lastMessage and unreadCount if needed
            const mainData = mainConv.data;
            const dupData = dupConv.data;
            
            if (dupData.lastMessageAt && mainData.lastMessageAt) {
              // Keep the most recent message
              if (dupData.lastMessageAt > mainData.lastMessageAt) {
                await db.collection('conversations').doc(mainConv.id).update({
                  lastMessage: dupData.lastMessage,
                  lastMessageAt: dupData.lastMessageAt,
                });
              }
            }

            // Delete duplicate conversation document
            await db.collection('conversations').doc(dupConv.id).delete();
            console.log(`  ✗ Deleted: ${dupConv.id}`);
            totalDeleted++;
          } else {
            console.log(`  ✗ Would delete: ${dupConv.id}`);
          }
        } catch (err) {
          console.error(`  ✗ Error merging ${dupConv.id}:`, err.message);
        }
      }

      totalMerged += duplicateConvs.length;
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Mode: ${isApply ? 'APPLIED' : 'DRY-RUN'}`);
    console.log(`Duplicate groups found: ${duplicateGroups.length}`);
    console.log(`Conversations consolidated: ${totalMerged}`);
    console.log(`Conversations deleted: ${totalDeleted}`);

    if (!isApply) {
      console.log(`\nTo actually merge and delete, run with --apply flag`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await admin.app().delete();
    process.exit(0);
  }
}

consolidateDuplicateConversations();
