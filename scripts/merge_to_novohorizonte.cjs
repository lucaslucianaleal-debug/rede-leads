const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const fs = require('fs');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TARGET_CLINIC = 'odontocompany-novohorizonte';
const BACKUP_DIR = `backups/clinics/${TARGET_CLINIC}`;

function nowTag() { return new Date().toISOString().replace(/[:.]/g,'-'); }

async function run() {
  try {
    // Load crm_users for the clinic
    const crmUsersSnap = await db.collection('crm_users').where('clinicId', '==', TARGET_CLINIC).get();
    const crmUsers = crmUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Also check users collection for clinic mapping
    const usersSnap = await db.collection('users').where('clinicId', '==', TARGET_CLINIC).get();
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    console.log('crm_users count for clinic:', crmUsers.length);
    console.log('users count for clinic:', users.length);

    const candidateUids = new Set([...crmUsers.map(u=>u.id), ...users.map(u=>u.id)]);
    const candidateNames = new Set([...crmUsers.map(u=>u.name||''), ...users.map(u=>u.name||'')].filter(Boolean));
    const candidateEmails = new Set([...crmUsers.map(u=>u.email||''), ...users.map(u=>u.email||'')].filter(Boolean));

    // Read source crm_data/shared
    const crmSharedRef = db.collection('crm_data').doc('shared');
    const crmSharedSnap = await crmSharedRef.get();
    const crmLeads = (crmSharedSnap.exists && crmSharedSnap.data().leads) || [];
    console.log('crm_data/shared leads count:', crmLeads.length);

    // Heuristics to pick leads that likely belong to the clinic:
    // - lead.captador matches user name or email
    // - lead.createdBy matches uid
    // - lead.captador includes clinic short name
    const picks = [];
    for (const lead of crmLeads) {
      const capt = (lead.captador || '').toString().toLowerCase();
      const createdBy = (lead.createdBy || '').toString();
      let matched = false;
      if (createdBy && candidateUids.has(createdBy)) matched = true;
      if (!matched) {
        for (const name of candidateNames) if (name && capt.includes(name.toLowerCase())) { matched = true; break; }
      }
      if (!matched) {
        for (const em of candidateEmails) if (em && capt.includes(em.toLowerCase())) { matched = true; break; }
      }
      if (!matched) {
        if (capt.includes('novohorizonte') || capt.includes('novo horizonte') || capt.includes('novohorizont')) matched = true;
      }
      if (matched) picks.push(lead);
    }

    console.log('Candidate leads found in crm_data/shared:', picks.length);

    // Also inspect top-level `leads` collection for documents that may reference clinic users
    const leadsColSnap = await db.collection('leads').limit(500).get();
    const leadsCol = leadsColSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const picksFromLeadsCol = leadsCol.filter(l => {
      const capt = (l.captador || '').toString().toLowerCase();
      if (l.createdBy && candidateUids.has(l.createdBy)) return true;
      for (const name of candidateNames) if (name && capt.includes(name.toLowerCase())) return true;
      for (const em of candidateEmails) if (em && capt.includes(em.toLowerCase())) return true;
      if (capt.includes('novohorizonte') || capt.includes('novo horizonte') || capt.includes('novohorizont')) return true;
      return false;
    });
    console.log('Candidate leads found in `leads` collection (sampled):', picksFromLeadsCol.length);

    // Prepare backup of target doc
    const targetRef = db.collection('clinics').doc(TARGET_CLINIC).collection('shared').doc('shared');
    const targetSnap = await targetRef.get();
    const targetData = targetSnap.exists ? targetSnap.data() : { leads: [] };

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = `${BACKUP_DIR}/backup-before-merge-${nowTag()}.json`;
    fs.writeFileSync(backupPath, JSON.stringify({ generatedAt: nowTag(), targetData, picksCount: picks.length, picksSample: picks.slice(0,5) }, null, 2));
    console.log('Backup written to', backupPath);

    // Merge: add unique leads from picks into target leads (avoid duplicates by id or telefone)
    const existingLeads = targetData.leads || [];
    const existingIds = new Set(existingLeads.map(l=>l.id));
    const existingPhones = new Set(existingLeads.map(l=>(l.telefone||'').replace(/\D/g,'')));
    const toAdd = [];
    for (const p of picks) {
      if (existingIds.has(p.id)) continue;
      const norm = (p.telefone||'').replace(/\D/g,'');
      if (norm && existingPhones.has(norm)) continue;
      toAdd.push(p);
    }

    // Also add from picksFromLeadsCol if their id not in existing
    for (const p of picksFromLeadsCol) {
      if (existingIds.has(p.id)) continue;
      const norm = (p.telefone||'').replace(/\D/g,'');
      if (norm && existingPhones.has(norm)) continue;
      toAdd.push(p);
    }

    console.log('Leads to add to target:', toAdd.length);
    if (toAdd.length === 0) {
      console.log('Nothing to add. Exiting.');
      process.exit(0);
    }

    const merged = [...existingLeads, ...toAdd];
    await targetRef.set({ leads: merged, lastUpdated: new Date().toISOString() }, { merge: true });
    console.log('Merge complete. Added', toAdd.length, 'leads to', `clinics/${TARGET_CLINIC}/shared/shared`);

    // Save report
    const report = { generatedAt: nowTag(), target: `clinics/${TARGET_CLINIC}/shared/shared`, added: toAdd.length, addedSample: toAdd.slice(0,5).map(l=>({id:l.id,nome:l.nome,telefone:l.telefone})) };
    const reportPath = `${BACKUP_DIR}/merge-report-${nowTag()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report,null,2));
    console.log('Report saved to', reportPath);

  } catch (e) {
    console.error('Error during merge:', e);
    process.exit(1);
  }
}

run();
