import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const serviceAccountKey = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'whatsapp-server/serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

const db = admin.firestore();

async function searchLeads() {
  const crmRef = db.collection('crm_data').doc('shared');
  const crmSnap = await crmRef.get();
  const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];

  const searchNames = ['Rafaela', 'Sill', 'Marina'];
  
  for (const searchName of searchNames) {
    console.log(`\n=== Searching for "${searchName}" ===`);
    const matches = leads.filter(l => 
      String(l.nome || '').toLowerCase().includes(searchName.toLowerCase())
    );
    
    if (matches.length === 0) {
      console.log('No matches found');
    } else {
      for (const lead of matches) {
        console.log(`${lead.nome} | Phone: ${lead.telefone}`);
      }
    }
  }

  await admin.app().delete();
}

searchLeads();
