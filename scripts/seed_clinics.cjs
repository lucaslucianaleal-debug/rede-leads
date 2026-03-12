const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seed() {
  const clinics = [
    { id: 'odontocompany-olimpia', name: 'Odontocompany Olimpia', whatsapp: '+5517991154763' },
    { id: 'odontocompany-badybassit', name: 'Odontocompany Bady Bassit', whatsapp: '+5517999990001' },
    { id: 'odontocompany-novohorizonte', name: 'Odontocompany Novo Horizonte', whatsapp: '+5517999990002' },
  ];

  for (const clinic of clinics) {
    console.log('Seeding clinic', clinic.id);
    await db.collection('clinics').doc(clinic.id).set({ settings: { name: clinic.name, whatsapp: clinic.whatsapp } }, { merge: true });
  }

  // Create admin user mapping (not creating Firebase Auth user)
  const adminUser = {
    name: 'Lucas Leal',
    role: 'admin',
    clinics: ['*'],
  };
  console.log('Creating admin user doc for lucaslucianaleal (manual link to Auth required)');
  await db.collection('users').doc('lucaslucianaleal').set(adminUser, { merge: true });

  console.log('Seed complete');
}

seed().catch((e) => { console.error(e); process.exit(1); });
