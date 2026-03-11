/**
 * Merge two conversation documents in Firestore.
 * Usage:
 *   node scripts/merge_conversations.js <sourceConvId> <targetPhone> [--apply]
 * Example:
 *   node scripts/merge_conversations.js 48859916343 "(17) 99727-3860" --apply
 *
 * The script will copy messages from source conversation to target conversation (target id
 * is derived from the provided phone by taking the last 10 digits). If --apply is provided,
 * writes are performed and the source conversation document is deleted.
 */

import admin from 'firebase-admin';

function onlyDigits(s) {
  return String(s).replace(/\D/g, '');
}

function toLastN(phone, n) {
  const d = onlyDigits(phone);
  if (!d) return '';
  return d.length >= n ? d.slice(-n) : d;
}

async function resolveTargetId(db, phone) {
  // Try existing conversation docs by suffix: prefer longest suffix that exists
  const tries = [10, 9, 8];
  for (const n of tries) {
    const candidate = toLastN(phone, n);
    if (!candidate) continue;
    try {
      const doc = await db.collection('conversations').doc(candidate).get();
      if (doc.exists) return { id: candidate, matchedBy: `last${n}` };
    } catch (err) {
      // ignore transient read errors here; caller will surface
    }
  }
  return { id: toLastN(phone, 10), matchedBy: 'fallback-last10' };
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

  try {
    // always read local service account and initialize with cert
    const { readFileSync } = await import('fs');
    const path = 'c:/CRM ODC - REDE NT/whatsapp-server/serviceAccountKey.json';
    const svc = JSON.parse(readFileSync(path, 'utf8'));
    process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || svc.project_id;
    process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || svc.project_id;
    admin.initializeApp({ credential: admin.credential.cert(svc), projectId: svc.project_id });
    console.log('[init] Initialized firebase-admin using whatsapp-server/serviceAccountKey.json');
  } catch (e) {
    console.error('Failed to initialize firebase-admin with local service account.');
    console.error(e);
    process.exit(1);
  }

  const db = admin.firestore();

  // Resolve target id by trying existing conversation docs with suffix fallbacks
  const resolved = await resolveTargetId(db, targetPhone);
  const targetId = resolved.id;

  console.log(`Source conversation: ${sourceId}`);
  console.log(`Target conversation: ${targetId} (matchedBy=${resolved.matchedBy})`);

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

  // Batch-write configuration (env overrides available)
  const BATCH_SIZE = Number(process.env.MERGE_BATCH_SIZE) || 200; // Firestore limit 500
  const DELAY_MS = Number(process.env.MERGE_BATCH_DELAY_MS) || 250;
  const MAX_RETRIES = 5;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  let copied = 0;
  const batches = [];
  for (let i = 0; i < msgsToCopy.length; i += BATCH_SIZE) {
    batches.push(msgsToCopy.slice(i, i + BATCH_SIZE));
  }

  for (let idx = 0; idx < batches.length; idx++) {
    const batchDocs = batches[idx];
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        const batch = db.batch();
        for (const msgDoc of batchDocs) {
          const data = msgDoc.data();
          const targetMsgRef = targetRef.collection('messages').doc(msgDoc.id);
          batch.set(targetMsgRef, data);
        }
        await batch.commit();
        copied += batchDocs.length;
        console.log(`Batch ${idx + 1}/${batches.length} committed (${batchDocs.length} msgs)`);
        break;
      } catch (err) {
        attempt++;
        const backoff = 200 * Math.pow(2, attempt);
        console.error(`Batch ${idx + 1} commit failed (attempt ${attempt}):`, err.message || err, `— retrying in ${backoff}ms`);
        await sleep(backoff);
      }
    }
    // brief pause between batches to avoid quota bursts
    if (idx < batches.length - 1) await sleep(DELAY_MS);
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
