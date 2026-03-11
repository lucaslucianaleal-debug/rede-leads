const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main(){
  try{
    const ref = db.collection('meta').doc('refreshMessages');
    await ref.set({ts: Date.now()});
    console.log('[push-refresh] updated meta/refreshMessages');
    process.exit(0);
  }catch(e){
    console.error('[push-refresh] error', e);
    process.exit(2);
  }
}

main();
