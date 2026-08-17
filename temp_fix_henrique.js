const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

(async () => {
  const snapshot = await db.collection('clinics').get();
  const matches = [];

  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const hay = `${doc.id} ${data.name || ''} ${data.module || ''}`.toLowerCase();
    if (hay.includes('henrique')) {
      matches.push({ id: doc.id, data });
    }
  });

  console.log('MATCHES', JSON.stringify(matches, null, 2));

  for (const match of matches) {
    const data = match.data || {};
    const ref = db.collection('clinics').doc(match.id);
    await ref.set(
      {
        module: 'corretor',
        customServices: Array.isArray(data.customServices) ? data.customServices : [],
        name: data.name || match.id,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log('UPDATED', match.id);
  }
})();
