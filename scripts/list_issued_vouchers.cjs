#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'serviceAccountKey.json');
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  const sa = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  admin.initializeApp();
}

const db = admin.firestore();

async function run() {
  console.log('Listing vouchers with issuedByJob=true');
  const snap = await db.collection('vouchers').where('issuedByJob', '==', true).get();
  if (snap.empty) {
    console.log('No vouchers found');
  } else {
    snap.forEach(doc => {
      const d = doc.data();
      console.log('---');
      console.log('id:', doc.id);
      console.log('leadId:', d.leadId);
      console.log('leadNome:', d.leadNome);
      console.log('amount:', d.amount);
      console.log('tierMonths:', d.tierMonths);
      console.log('code:', d.code);
      console.log('status:', d.status);
      console.log('expiresAt:', d.expiresAt);
      console.log('imageLocalPath:', d.imageLocalPath);
    });
  }

  console.log('\nChecking crm_data/shared leads for voucher markers');
  const crmRef = db.collection('crm_data').doc('shared');
  const crmSnap = await crmRef.get();
  if (!crmSnap.exists) {
    console.log('crm_data/shared not found');
    return;
  }
  const leads = (crmSnap.data().leads || []);
  const marked = leads.filter(l => l.voucherPending || l.voucherLastIssuedTier);
  console.log(`Found ${marked.length} leads with voucher flags`);
  marked.forEach(l => {
    console.log('---');
    console.log('lead id:', l.id || '(no id)');
    console.log('nome:', l.nome);
    console.log('telefone:', l.telefone);
    console.log('voucherLastIssuedTier:', l.voucherLastIssuedTier);
    console.log('voucherLastIssuedAt:', l.voucherLastIssuedAt);
    console.log('voucherPending:', l.voucherPending);
  });
}

run().catch(e => { console.error('Error', e); process.exit(1); });
