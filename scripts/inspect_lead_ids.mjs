import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT || path.resolve('C:/Users/leall/Downloads/rede-leads-firebase-adminsdk-fbsvc-dc9fb0de05.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) { console.error('Service account not found'); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH,'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const ids = ['lead_1773231434408','lead_1773248653514','1781041260','1352553534'];
(async()=>{
  for(const id of ids){
    const snap = await db.collection('leads').doc(id).get();
    console.log('\nlead doc id=',id,' exists=',snap.exists);
    if(snap.exists) console.log(JSON.stringify(snap.data(),null,2));
  }
  // search for leads that contain telefone matching numeric ids
  const phones = ['1781041260','1352553534'];
  for(const p of phones){
    const q = await db.collection('leads').where('telefone','==',p).get();
    console.log('\nsearch telefone==',p,' hits=',q.size);
    q.docs.forEach(d=>console.log(' ->',d.id, JSON.stringify(d.data())));
  }
  process.exit(0);
})();
