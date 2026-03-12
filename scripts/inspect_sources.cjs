const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function readDoc(pathRef) {
  try {
    const snap = await pathRef.get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.error('readDoc error for', pathRef.path, e);
    return null;
  }
}

async function inspect(clinicId) {
  console.log('Inspecting for clinic:', clinicId);

  const crmDataRef = db.collection('crm_data').doc('shared');
  const crmData = await readDoc(crmDataRef);
  const crmLeads = Array.isArray(crmData?.leads) ? crmData.leads : [];
  console.log(`crm_data/shared -> leads=${crmLeads.length}`);
  if (crmLeads.length > 0) {
    console.log('Sample crm_data/shared (first 5 names):');
    crmLeads.slice(0,5).forEach((l,i)=>console.log(`  ${i+1}. ${l.nome || '(no-name)'} ${l.telefone || ''}`));
  }

  const clinicRef = db.collection('clinics').doc(clinicId).collection('shared').doc('shared');
  const clinicData = await readDoc(clinicRef);
  const clinicLeads = Array.isArray(clinicData?.leads) ? clinicData.leads : [];
  console.log(`clinics/${clinicId}/shared/shared -> leads=${clinicLeads.length}`);
  if (clinicLeads.length > 0) {
    console.log('Sample clinic shared (first 5):');
    clinicLeads.slice(0,5).forEach((l,i)=>console.log(`  ${i+1}. ${l.nome || '(no-name)'} ${l.telefone || ''}`));
  }

  // Inspect top documents in 'leads' collection (first 50)
  try {
    const leadsSnap = await db.collection('leads').limit(50).get();
    console.log(`leads collection -> docs=${leadsSnap.size} (sample up to 50)`);
    let i = 0;
    leadsSnap.forEach(doc => {
      i++;
      const d = doc.data();
      console.log(`${i}. id=${doc.id} nome=${d.nome || d.name || '(no-name)'} telefone=${d.telefone || d.telefone_norm || ''}`);
    });
  } catch (e) {
    console.error('Error reading leads collection:', e);
  }

  // Search for leads in 'leads' collection that include clinic name in observacao or other
  try {
    const querySnap = await db.collection('leads').where('observacao','!=',null).limit(100).get();
    let matched = 0;
    querySnap.forEach(doc => {
      const d = doc.data();
      const obs = String(d.observacao || '').toLowerCase();
      if (obs.includes(clinicId) || obs.includes('novo horizonte') || obs.includes('novohorizonte')) {
        matched++;
        console.log(`Matched in leads: id=${doc.id} nome=${d.nome || ''} obs=${d.observacao}`);
      }
    });
    console.log(`leads that mention clinic text (sample scan): ${matched}`);
  } catch (e) {
    // ignore
  }
}

const clinicId = process.argv[2] || 'odontocompany-novohorizonte';
inspect(clinicId).then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1)});
