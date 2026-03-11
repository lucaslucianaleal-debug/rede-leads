import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

try{
  const svc = JSON.parse(fs.readFileSync(path.join(__dirname,'serviceAccountKey.json'),'utf8'));
  if(!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(svc), projectId: svc.project_id });
}catch(e){
  try{ if(!admin.apps.length) admin.initializeApp(); }catch(err){ console.error('Firebase init failed', err); process.exit(1); }
}

const db = admin.firestore();

const badId = '9268848730';
const desiredFull = '17992702010'; // user-provided real number
const desiredCanonical = '1792702010'; // expected 10-digit canonical

function candidatesFor(full){
  const d = onlyDigits(full);
  const last10 = d.length>=10? d.slice(-10): d;
  const out = new Set();
  out.add(d);
  out.add(last10);
  out.add('55'+d);
  out.add('55'+last10);
  // canonical attempt: if last10 is 11 with mobile 9 logic, also try removing 9 after DDD
  if (d.length === 11) {
    // remove the 3rd digit (index 2) if it's 9
    if (d[2] === '9') {
      const without9 = d.slice(0,2) + d.slice(3);
      out.add(without9);
      out.add('55'+without9);
    }
  }
  return Array.from(out).filter(Boolean);
}

(async ()=>{
  try{
    console.log('Searching for conversation with id or digits matching', badId);
    const convRef = db.collection('conversations').doc(badId);
    const convSnap = await convRef.get();
    let foundId = null;
    let convData = null;

    if (convSnap.exists) {
      foundId = badId;
      convData = convSnap.data();
      console.log('Found conversation exact id:', badId);
    } else {
      // try to find by digits matching
      const all = await db.collection('conversations').get();
      for (const d of all.docs) {
        const digits = onlyDigits(d.id);
        if (digits === badId || digits.endsWith(badId) || badId.endsWith(digits)) {
          foundId = d.id;
          convData = d.data();
          console.log('Found conversation by digits match:', d.id);
          break;
        }
      }
    }

    if (!foundId) {
      console.log('No exact match. Scanning all conversations for candidates...');
      const all = await db.collection('conversations').get();
      const desiredDigits = onlyDigits(desiredFull);
      const last10 = desiredDigits.length>=10? desiredDigits.slice(-10): desiredDigits;
      const variants = candidatesFor(desiredFull).concat([badId, last10, desiredCanonical]);
      const matches = [];
      for (const d of all.docs) {
        const digits = onlyDigits(d.id);
        // if any variant equals or is included in digits or vice versa
        for (const v of variants) {
          if (!v) continue;
          if (digits === v || digits.endsWith(v) || v.endsWith(digits) || digits.includes(v) || v.includes(digits)) {
            matches.push({ id: d.id, digits, data: d.data() });
            break;
          }
        }
      }
      if (matches.length === 0) {
        console.log('No candidate conversations found for variants:', variants);
        process.exit(0);
      }
      console.log('Candidate conversations:');
      matches.forEach(m => console.log(JSON.stringify({id:m.id,digits:m.digits,leadNome:m.data.leadNome,leadId:m.data.leadId,telefone:m.data.telefone})));
      process.exit(0);
    }

    console.log('Conversation snapshot:', foundId, convData);

    // Load leads to find matching lead by telefone
    const sharedRef = db.doc('crm_data/shared');
    const sharedSnap = await sharedRef.get();
    let leads = [];
    if (sharedSnap.exists) leads = sharedSnap.data().leads || [];

    const desiredDigits = onlyDigits(desiredFull);
    let matchedLead = null;
    for (const l of leads) {
      const ld = onlyDigits(l.telefone || '');
      if (!ld) continue;
      // match full or canonical
      if (ld === desiredDigits) { matchedLead = l; break; }
      if (ld.endsWith(desiredDigits)) { matchedLead = l; break; }
      // compare canonical 10
      const canon = ld.length>=10? ld.slice(-10): ld;
      if (canon === desiredCanonical) { matchedLead = l; break; }
    }

    console.log('Matched lead from crm_data/shared:', matchedLead ? { id: matchedLead.id, nome: matchedLead.nome, telefone: matchedLead.telefone } : null);

    // Prepare new conversation doc
    const newId = desiredCanonical;
    const newConvRef = db.collection('conversations').doc(newId);

    // Merge convData with desired fields
    const updatedConv = {
      ...(convData || {}),
      telefone: newId,
      leadNome: matchedLead ? matchedLead.nome || '' : (convData && convData.leadNome) ? convData.leadNome : '',
      leadId: matchedLead ? matchedLead.id : (convData && convData.leadId) ? convData.leadId : undefined,
    };

    // Write new conversation doc
    await newConvRef.set(updatedConv, { merge: true });
    console.log('Wrote conversation to new ID:', newId);

    // Move messages subcollection (copy then delete)
    const msgsSnap = await db.collection('conversations').doc(foundId).collection('messages').get();
    console.log('Found', msgsSnap.size, 'messages to move');
    const batch = db.batch();
    for (const m of msgsSnap.docs) {
      const data = m.data();
      const newMsgRef = db.collection('conversations').doc(newId).collection('messages').doc(m.id);
      batch.set(newMsgRef, data);
      batch.delete(m.ref);
    }
    await batch.commit();
    console.log('Moved messages to new conversation');

    // Delete old conversation doc if different id
    if (foundId !== newId) {
      await db.collection('conversations').doc(foundId).delete();
      console.log('Deleted old conversation doc:', foundId);
    }

    console.log('Fix completed. Summary:');
    console.log('Old ID:', foundId);
    console.log('New ID:', newId);
    console.log('Lead linked:', matchedLead ? matchedLead.id : '(none found)');

    // Try to explain why digit was eaten: inspect any messages or original telefone field
    if (convData && convData.telefone) {
      console.log('Original conv telefone field:', convData.telefone);
    }

    // Inspect messages for original sender info that might indicate parsing bug
    if (msgsSnap.size > 0) {
      const sample = msgsSnap.docs.slice(0,3).map(d=>({id:d.id,data:d.data()}));
      console.log('Sample moved messages (from old doc):', sample);
    }

    process.exit(0);
  }catch(err){ console.error('Error:', err); process.exit(1); }
})();
