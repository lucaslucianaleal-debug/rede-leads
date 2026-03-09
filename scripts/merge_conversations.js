/**
 * Merge two conversation documents in Firestore.
 * Usage:
 *   node scripts/merge_conversations.js <sourceConvId> <targetPhone> [--apply]
 * Example:
 *   node scripts/merge_conversations.js 48859916343 "(17) 99727-3860" --apply
 *
 * The script will copy messages from source conversation to target conversation (target id
 * is derived from the provided phone by taking the last 11 digits). If --apply is provided,
 * writes are performed and the source conversation document is deleted.
 */

import admin from 'firebase-admin';

function onlyDigits(s) {
  return String(s).replace(/\D/g, '');
}

function toLast11(phone) {
  const d = onlyDigits(phone);
  if (!d) return '';
  return d.length >= 11 ? d.slice(-11) : d;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/merge_conversations.js <sourceConvId> <targetPhone> [--apply]');
    process.exit(1);
  }
  const apply = args.includes('--apply');
  const sourceId = args[0];
  const targetPhone = args[1];
  const targetId = toLast11(targetPhone);

  if (!targetId) {
    console.error('Could not derive target conversation id from phone:', targetPhone);
    process.exit(1);
  }

  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } catch (e) {
    console.error('Failed to initialize firebase-admin. Ensure GOOGLE_APPLICATION_CREDENTIALS is set.');
    console.error(e);
    process.exit(1);
  }

  const db = admin.firestore();

  console.log(`Source conversation: ${sourceId}`);
  console.log(`Target conversation (last11): ${targetId}`);

  const sourceRef = db.collection('conversations').doc(sourceId);
  const targetRef = db.collection('conversations').doc(targetId);

  const [sourceSnap, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()]);

  if (!sourceSnap.exists) {
    console.error(`Source conversation ${sourceId} does not exist.`);
    await admin.app().delete();
    process.exit(1);
  }

  const sourceData = sourceSnap.data() || {};
  const targetData = targetSnap.exists ? (targetSnap.data() || {}) : {};

  console.log('Source data:', JSON.stringify({ leadId: sourceData.leadId, leadNome: sourceData.leadNome }, null, 2));
  console.log('Target exists:', targetSnap.exists, 'target data:', JSON.stringify({ leadId: targetData.leadId, leadNome: targetData.leadNome }, null, 2));

  // Count messages
  const srcMsgsSnap = await sourceRef.collection('messages').get();
  const tgtMsgsSnap = await targetRef.collection('messages').get();

  const srcMsgIds = new Set(srcMsgsSnap.docs.map(d => d.id));
  const tgtMsgIds = new Set(tgtMsgsSnap.docs.map(d => d.id));

  const msgsToCopy = srcMsgsSnap.docs.filter(d => !tgtMsgIds.has(d.id));

  console.log(`Messages in source: ${srcMsgsSnap.size}`);
  console.log(`Messages in target: ${tgtMsgsSnap.size}`);
  console.log(`Messages to copy: ${msgsToCopy.length}`);

  if (!apply) {
    console.log('\nDry-run mode. No writes will be performed. To apply changes, run with --apply');
    await admin.app().delete();
    process.exit(0);
  }

  // Perform copy of messages
  let copied = 0;
  for (const msgDoc of msgsToCopy) {
    const msgData = msgDoc.data();
    const targetMsgRef = targetRef.collection('messages').doc(msgDoc.id);
    try {
      await targetMsgRef.set(msgData);
      copied++;
    } catch (err) {
      console.error('Failed to copy message', msgDoc.id, err.message || err);
    }
  }

  console.log(`Copied ${copied} messages to ${targetId}`);

  // Merge metadata: if target missing leadId/leadNome, copy from source
  const updates = {};
  if (!targetData.leadId && sourceData.leadId) updates.leadId = sourceData.leadId;
  if (!targetData.leadNome && sourceData.leadNome) updates.leadNome = sourceData.leadNome;
  if (!targetData.telefone && sourceData.telefone) updates.telefone = sourceData.telefone;

  if (Object.keys(updates).length > 0) {
    try {
      await targetRef.set(updates, { merge: true });
      console.log('Updated target conversation metadata:', updates);
    } catch (err) {
      console.error('Failed to update target metadata:', err.message || err);
    }
  } else {
    console.log('No metadata updates needed for target.');
  }

  // Update lastMessage & lastMessageAt if source is more recent
  try {
    const srcLast = sourceData.lastMessageAt;
    const tgtLast = targetData.lastMessageAt;
    if (srcLast && (!tgtLast || srcLast > tgtLast)) {
      await targetRef.set({ lastMessage: sourceData.lastMessage, lastMessageAt: sourceData.lastMessageAt }, { merge: true });
      console.log('Updated target lastMessage/lastMessageAt from source.');
    }
  } catch (err) {
    console.error('Failed to update lastMessage fields:', err.message || err);
  }

  // Delete source conversation doc
  try {
    await sourceRef.delete();
    console.log(`Deleted source conversation ${sourceId}`);
  } catch (err) {
    console.error('Failed to delete source conversation:', err.message || err);
  }

  await admin.app().delete();
  console.log('Done.');
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  try { await admin.app().delete(); } catch {};
  process.exit(1);
});
