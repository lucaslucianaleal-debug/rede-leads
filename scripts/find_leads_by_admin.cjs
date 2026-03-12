const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const { format } = require('date-fns');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main(email) {
  try {
    console.log('Looking up auth user by email:', email);
    let authUser = null;
    try { authUser = await admin.auth().getUserByEmail(email); } catch(e) { /* ignore */ }
    if (authUser) console.log('Found auth user:', authUser.uid);
    else console.log('No Auth user for that email');

    const uid = authUser ? authUser.uid : null;
    if (uid) {
      const userDoc = await db.collection('users').doc(uid).get();
      console.log('users/{uid} exists:', userDoc.exists);
      if (userDoc.exists) console.log('users/{uid} ->', userDoc.data());

      const crmUsersDoc = await db.collection('crm_users').doc(uid).get();
      console.log('crm_users/{uid} exists:', crmUsersDoc.exists);
      if (crmUsersDoc.exists) console.log('crm_users/{uid} ->', crmUsersDoc.data());
    }

    const today = format(new Date(), 'dd/MM/yyyy');
    console.log('\nSearching leads with dates starting today (', today, ') across sources...');

    // crm_data/shared
    const crmDataSnap = await db.collection('crm_data').doc('shared').get();
    const crmLeads = Array.isArray(crmDataSnap.data()?.leads) ? crmDataSnap.data().leads : [];
    const crmMatches = crmLeads.filter(l => (l.dataCriacao || '').startsWith(today) || (l.dataContato || '').startsWith(today) || (l.lastFollowUpDone||'').startsWith(today));
    console.log(`crm_data/shared -> total=${crmLeads.length}, matchesToday=${crmMatches.length}`);
    crmMatches.slice(0,10).forEach((l,i)=>console.log(`  ${i+1}. ${l.nome||'(no-name)'} ${l.telefone||''} etapa=${l.etapaLead||''}`));

    // clinics/*/shared/shared
    const clinicsSnap = await db.collection('clinics').get();
    for (const doc of clinicsSnap.docs) {
      const cid = doc.id;
      const cref = db.collection('clinics').doc(cid).collection('shared').doc('shared');
      const csnap = await cref.get();
      const leads = Array.isArray(csnap.data()?.leads) ? csnap.data().leads : [];
      const matches = leads.filter(l => (l.dataCriacao||'').startsWith(today) || (l.dataContato||'').startsWith(today) || (l.lastFollowUpDone||'').startsWith(today));
      if (matches.length>0) {
        console.log(`clinics/${cid}/shared/shared -> total=${leads.length}, matchesToday=${matches.length}`);
        matches.slice(0,10).forEach((l,i)=>console.log(`  ${i+1}. ${l.nome||'(no-name)'} ${l.telefone||''} etapa=${l.etapaLead||''}`));
      }
    }

    // leads collection: query by fields starting today (inefficient full scan limited)
    console.log('\nScanning up to 1000 docs in `leads` collection for today dates...');
    const leadSnap = await db.collection('leads').limit(1000).get();
    const leadMatches = [];
    leadSnap.forEach(doc=>{
      const d = doc.data();
      if ((d.dataCriacao||'').startsWith(today) || (d.dataContato||'').startsWith(today) || (d.lastFollowUpDone||'').startsWith(today)) {
        leadMatches.push({ id: doc.id, data: d });
      }
    });
    console.log(`leads collection scanned=${leadSnap.size}, matchesToday=${leadMatches.length}`);
    leadMatches.slice(0,20).forEach((m,i)=>console.log(`  ${i+1}. id=${m.id} nome=${m.data.nome||''} telefone=${m.data.telefone||''}`));

    if (uid) {
      // check if any leads mention uid in observacao or createdBy
      console.log('\nSearching leads mentioning uid in observacao or createdBy');
      const mentionMatches = [];
      leadSnap.forEach(doc=>{
        const d = doc.data();
        const obs = String(d.observacao||'').toLowerCase();
        if (obs.includes(uid.toLowerCase())) mentionMatches.push({ id: doc.id, obs: d.observacao });
        if ((d.createdBy||'').toString() === uid) mentionMatches.push({ id: doc.id, createdBy: d.createdBy });
      });
      console.log('mentions found in sample:', mentionMatches.length);
      mentionMatches.slice(0,10).forEach((m,i)=>console.log(`  ${i+1}.`, m));
    }

    console.log('\nDone.');
  } catch (e) {
    console.error('Error:', e);
  }
}

const email = process.argv[2] || 'adm.novohorizonte@gmail.com';
main(email).then(()=>process.exit(0));
