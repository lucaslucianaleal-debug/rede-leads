import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

function formatDate(ts){
  if(!ts) return 'no-timestamp';
  if(typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if(ts._seconds) return new Date(ts._seconds*1000).toISOString();
  if(typeof ts === 'number') return new Date(ts).toISOString();
  return String(ts);
}

async function main(){
  const args = process.argv.slice(2);
  if(args.length < 1){ console.error('Usage: node inspect_messages.js <convId> [--since=YYYY-MM-DD]'); process.exit(1); }
  const convId = args[0];
  try{
    const svc = JSON.parse(fs.readFileSync(path.join(process.cwd(),'whatsapp-server','serviceAccountKey.json'),'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }catch(e){ try{ admin.initializeApp(); }catch(err){ console.error('Firebase init failed',err); process.exit(1); } }
  const db = admin.firestore();
  const msgsSnap = await db.collection('conversations').doc(convId).collection('messages').orderBy('timestamp','asc').get();
  console.log(`Found ${msgsSnap.size} messages in ${convId}`);
  for(const d of msgsSnap.docs){
    const data = d.data();
    const ts = data.timestamp || data.t || data.createdAt || data.receivedAt || data.created || null;
    console.log('---');
    console.log('id:', d.id);
    console.log('from:', data.from || data.author || data.sender || data.fromMe ? 'me' : 'them');
    console.log('body:', data.body || data.message || data.text || data.content);
    console.log('timestamp:', formatDate(ts), 'raw keys:', Object.keys(data).join(','));
  }
  await admin.app().delete();
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
