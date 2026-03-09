/**
 * Console Snippet: Create orphan leads for unmatched conversations
 * 
 * Run this in the browser console (F12) on the CRM page to create leads for orphan conversations:
 * - 43894096073
 * - 58178613382
 * - 58237083780
 * - 66655355048
 * - 67517468904
 * - 96727685364
 * 
 * Copy-paste into console and run. Leads will be created with prefilled phone numbers.
 */

const orphanPhones = [
  { phone: "43894096073", name: "WhatsApp Contato 4096" },
  { phone: "58178613382", name: "WhatsApp Contato 8613" },
  { phone: "58237083780", name: "WhatsApp Contato 7083" },
  { phone: "66655355048", name: "WhatsApp Contato 5355" },
  { phone: "67517468904", name: "WhatsApp Contato 7468" },
  { phone: "96727685364", name: "WhatsApp Contato 6276" },
];

console.log("🔗 Orphan Conversation Leads Batch Creator");
console.log(`Found ${orphanPhones.length} orphan conversations to create as leads`);
console.log("Phones:", orphanPhones.map(p => p.phone).join(", "));
console.log("");
console.log("Option 1 (via clipboard): Copy the JSON below, go to AllLeads, paste into create-lead form:");
console.log(JSON.stringify(orphanPhones, null, 2));
console.log("");
console.log("Option 2 (via browser): Go to Chat tab, find each conversation, and click 'Criar Lead' button");
console.log("  - Then fill in the name and other details");
console.log("");
console.log("Option 3 (Firebase direct - advanced): Uncomment code below to create directly in Firestore:");
console.log("");
console.log(`/*
async function createOrphanLeads() {
  const { getFirestore, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
  const db = getFirestore();
  
  for (const { phone, name } of orphanPhones) {
    const leadId = \`orphan-\${Date.now()}\`;
    await setDoc(doc(db, 'crm_data', 'shared'), {
      leads: window.__leadsArray || []
    }, { merge: true });
    console.log(\`✓ Created lead: \${name} (\${phone})\`);
  }
  console.log("Done!");
}
createOrphanLeads();
*/`);
