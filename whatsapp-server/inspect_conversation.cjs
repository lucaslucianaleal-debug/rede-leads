const admin = require('firebase-admin');
const svc = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const idCandidates = process.argv.slice(2);
if(idCandidates.length === 0){
  console.error('Usage: node inspect_conversation.cjs <id1> [id2 ...]');
  process.exit(2);
}

(async ()=>{
  for(const id of idCandidates){
    try{
      const ref = db.collection('conversations').doc(id);
      const snap = await ref.get();
      if(!snap.exists){
        console.log(`NOT FOUND: ${id}`);
        continue;
      }
      const data = snap.data();
      console.log('---');
      console.log('ID:', id);
      console.log('Data:', JSON.stringify(data, null, 2));
      const msgs = await ref.collection('messages').orderBy('timestamp','desc').limit(5).get();
      console.log('Messages (latest 5):', msgs.size);
      msgs.forEach(m=>{
        const d = m.data();
        console.log('-', m.id, d.fromMe? 'me':'them', d.body ? (d.body.length>80? d.body.slice(0,80)+'...':d.body) : '', d.timestamp ? new Date(d.timestamp._seconds*1000).toISOString() : '');
      });
    }catch(e){
      console.error('ERR for',id,e.message||e);
    }
  }
  process.exit(0);
})();
