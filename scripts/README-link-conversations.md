Link conversations to leads (script)

Usage

1. Install dependencies (if not installed):

```bash
npm install firebase-admin
```

2. Provide service account credentials (download JSON from Firebase and set env var):

Windows (PowerShell):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\serviceAccountKey.json'
node scripts\link_conversations.js    # dry-run
node scripts\link_conversations.js --apply   # apply updates
```

Linux/macOS:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
node scripts/link_conversations.js
node scripts/link_conversations.js --apply
```

What it does

- Loads the leads array from document `crm_data/shared`.
- Scans documents in collection `conversations`.
- Matches conversations to leads by normalized phone (last 11 or last 8 digits).
- In dry-run, prints matches; with `--apply` updates conversations with `leadId` and `leadNome`.
