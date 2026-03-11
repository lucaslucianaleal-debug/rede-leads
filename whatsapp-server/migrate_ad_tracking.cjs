/*
  Migration script (dry-run by default):
  - Finds conversations whose `telefone` (or id) does NOT match any lead in crm_data.shared.leads
  - Moves that value into `adTrackingNumber` and removes `telefone` (or sets telefone=null)
  - Optionally merges messages into a lead's canonical conversation if a lead match is later found

  Usage (review then run):
    node migrate_ad_tracking.cjs         # dry-run: prints actions
    DRY_RUN=false node migrate_ad_tracking.cjs   # performs writes
*/

const admin = require('firebase-admin');
const svc = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

const DRY_RUN = (process.env.DRY_RUN || 'true') === 'true';

(async ()=>{
  try{
    console.log('[migrate-ad] starting (dryRun=%s)', DRY_RUN);
    const crmSnap = await db.collection('crm_data').doc('shared').get();
    const leads = crmSnap.exists ? (crmSnap.data().leads || []) : [];
    const leadSet = new Set();
    const lead10Set = new Set();
    for(const l of leads){
      const ld = onlyDigits(l.telefone || '');
      if(ld) leadSet.add(ld);
      if(ld.length >= 10) lead10Set.add(ld.slice(-10));
    }

    const convsSnap = await db.collection('conversations').get();
    const toMigrate = [];
    const keep = [];

    for(const c of convsSnap.docs){
      const data = c.data() || {};
      const tel = onlyDigits(String(data.telefone || c.id || ''));
      const last10 = tel.length >= 10 ? tel.slice(-10) : (onlyDigits(c.id || '').slice(-10) || tel);
      const matchesLead = leadSet.has(tel) || (last10 && lead10Set.has(last10));
      if(!matchesLead){
        toMigrate.push({ id: c.id, telefone: data.telefone || null });
      } else {
        keep.push({ id: c.id, telefone: data.telefone || null });
      }
    }

    console.log('[migrate-ad] total conversations:', convsSnap.size);
    console.log('[migrate-ad] to migrate (no lead match):', toMigrate.length);

    for(const item of toMigrate){
      console.log(' - will migrate:', item);
    }

    if(DRY_RUN){
      console.log('[migrate-ad] Dry run finished. To apply changes set DRY_RUN=false and re-run.');
      process.exit(0);
    }

    // Apply changes
    let changed = 0;
    for(const item of toMigrate){
      const ref = db.collection('conversations').doc(item.id);
      try{
        const snap = await ref.get();
        if(!snap.exists) continue;
        const cur = snap.data() || {};
        const updates = {};
        if(cur.telefone) updates.adTrackingNumber = cur.telefone;
        updates.telefone = admin.firestore.FieldValue.delete();
        updates.migratedAt = new Date().toISOString();
        updates.migratedBy = 'migrate_ad_tracking.cjs';
        await ref.update(updates);
        changed++;
        console.log('[migrate-ad] migrated', item.id);
      }catch(e){
        console.error('[migrate-ad] error migrating', item.id, e && e.message ? e.message : e);
      }
    }

    console.log('[migrate-ad] Completed. documents updated:', changed);
    process.exit(0);
  }catch(e){
    console.error('[migrate-ad] error', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
