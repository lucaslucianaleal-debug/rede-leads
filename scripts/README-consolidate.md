# Conversation Linking & Consolidation Scripts

## Overview

These scripts help manage conversations in Firestore by linking them to CRM leads and consolidating duplicates.

### 1. `link_conversations.js`
Links orphan conversations to leads based on phone number matching.

**Usage:**
```bash
# Dry-run (no changes)
node scripts/link_conversations.js

# Apply changes
node scripts/link_conversations.js --apply
```

**What it does:**
- Loads all leads from `crm_data/shared`
- Scans all conversation documents
- Matches by 7 phone normalization strategies (last-11 digits, with/without country code, etc.)
- Updates conversation docs with `leadId` and `leadNome` when a match is found
- Dry-run shows what would be matched without writing to Firestore

**Output:**
- Shows already-linked conversations
- Shows matched conversations (in apply mode)
- Lists orphaned conversations that have no matching lead

---

### 2. `consolidate_duplicate_conversations.js`
Consolidates conversations with the same `leadNome` or `leadId` into a single conversation document.

**Usage:**
```bash
# Dry-run (no changes)
node scripts/consolidate_duplicate_conversations.js

# Apply changes
node scripts/consolidate_duplicate_conversations.js --apply
```

**What it does:**
- Groups conversations by `leadNome` and `leadId`
- Identifies groups with duplicates (same contact appearing in 2+ conversation docs)
- Merges all messages from duplicates into the primary conversation
- Updates `lastMessage` and `lastMessageAt` to keep most recent
- **DELETES duplicate conversation documents** (in apply mode)

**Output:**
- Shows groups with duplicates
- Shows which conversation is the main (keeper) and which are duplicates
- Lists deleted conversations (in apply mode)

---

## Recommended Workflow

1. **Link conversations to leads:**
   ```bash
   node scripts/link_conversations.js --apply
   ```
   This ensures all conversations are linked to their corresponding leads.

2. **Consolidate duplicates:**
   ```bash
   node scripts/consolidate_duplicate_conversations.js --apply
   ```
   This removes duplicate conversation entries so each contact appears once.

3. **Reload the app:**
   - Press F5 in the browser to refresh
   - Conversation tab should now show unique contact entries

---

## Example Scenario

**Before:**
- Jéssica appears in 2 conversation docs: `17981612315` and `17988348920`
- Both point to the same lead
- User sees "Jéssica" twice in the conversation list

**After running consolidate:**
- Only `17981612315` remains
- `17988348920` is deleted
- All messages from both are in `17981612315`
- User sees "Jéssica" only once

---

## Environment Setup

Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set before running:

```bash
# On PowerShell (Windows):
$env:GOOGLE_APPLICATION_CREDENTIALS = "c:\path\to\serviceAccountKey.json"

# On bash (Linux/Mac):
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

Both scripts will use this to authenticate with Firebase.

---

## Notes

- Dry-run mode is safe and shows what would happen without making changes
- Always run dry-run first to review changes before applying
- Messages are preserved during consolidation (no data loss)
- Orphaned conversations (no matching lead) remain in the system; create leads via UI or the helper script
