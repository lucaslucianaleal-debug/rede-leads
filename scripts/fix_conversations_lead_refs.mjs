import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT || path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) { console.error('Service account not found at', SERVICE_ACCOUNT_PATH); process.exit(1); }
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const LOG = path.resolve('./scripts/fix_conversations_lead_refs.log');
function log(...args){ const line=`[${new Date().toISOString()}] ` + args.join(' '); console.log(line); fs.appendFileSync(LOG, line + '\n'); }

function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

async function findLeadByPhone(phone){
  if(!phone) return null;
  const p = onlyDigits(phone);
  // exact telefone field
  let q = await db.collection('leads').where('telefone','==', p).get();
  if(q.size) return q.docs[0];
  // telefone_norm
  q = await db.collection('leads').where('telefone_norm','==', p).get().catch(()=>({size:0,docs:[]}));
  if(q.size) return q.docs[0];
  // telefone_real
  q = await db.collection('leads').where('telefone_real','==', p).get().catch(()=>({size:0,docs:[]}));
  if(q.size) return q.docs[0];
  // try last10 match against numeric id
  const maybeId = p.slice(-10);
  const doc = await db.collection('leads').doc(maybeId).get().catch(()=>null);
  if(doc && doc.exists) return doc;
  return null;
}

async function main(){
  fs.writeFileSync(LOG, '');
  const convs = await db.collection('conversations').get();
  log('Total conversations:', convs.size);
  const results = [];
  for(const doc of convs.docs){
    const data = doc.data() || {};
    const lid = data.leadId;
    if(typeof lid === 'string' && lid.startsWith('lead_')){
      // try to find phone candidate
      const candidates = [data.telefone, data.adTrackingNumber, doc.id];
      let foundLead = null;
      let usedCandidate = null;
      for(const c of candidates){
        const leadDoc = await findLeadByPhone(c);
        if(leadDoc){ foundLead = leadDoc; usedCandidate = c; break; }
      }
      if(foundLead){
        const leadData = foundLead.data();
        const newLeadId = foundLead.id;
        // prefer numeric lead id (only digits)
        if(/^\d+$/.test(newLeadId)){
          const updates = {
            leadId: newLeadId,
            leadNome: leadData.nome || null,
            telefone: leadData.telefone || onlyDigits(usedCandidate) || null,
            nome: leadData.nome || data.nome || null
          };
          await db.collection('conversations').doc(doc.id).set(updates, { merge: true });
          log('Updated conversation', doc.id, 'leadId:', lid, '->', newLeadId, 'by phone candidate', usedCandidate);
          results.push({ conv: doc.id, from: lid, to: newLeadId, candidate: usedCandidate, status: 'updated' });
        } else {
          log('Found lead doc but id not numeric, skipping:', foundLead.id);
          results.push({ conv: doc.id, from: lid, to: foundLead.id, status: 'found-non-numeric' });
        }
      } else {
        log('No lead found for conversation', doc.id, 'leadId', lid, 'candidates', JSON.stringify(candidates));
        results.push({ conv: doc.id, from: lid, status: 'no-lead-found', candidates });
      }
    }
  }
  const out = { timestamp: new Date().toISOString(), total: convs.size, results };
  fs.writeFileSync(path.resolve('./scripts/fix_conversations_lead_refs_results.json'), JSON.stringify(out,null,2));
  log('Done. Summary saved to scripts/fix_conversations_lead_refs_results.json');
}

main().catch(e=>{ log('Fatal error', String(e)); process.exit(1); });
