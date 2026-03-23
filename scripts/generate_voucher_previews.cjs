#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'voucher_candidates.csv');
const OUT_DIR = path.join(__dirname, 'voucher_previews');

if (!fs.existsSync(CSV_PATH)) {
  console.error('CSV not found:', CSV_PATH);
  process.exit(1);
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const raw = fs.readFileSync(CSV_PATH, 'utf8');

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  // split header by commas not inside quotes
  const header = lines.shift().split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(h => h.replace(/^\s+|\s+$/g, ''));

  const rows = lines.map(line => {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; continue; }
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        fields.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    fields.push(cur);

    // map header->value
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      let val = fields[i] || '';
      val = val.replace(/^\s+|\s+$/g, '');
      obj[key] = val.replace(/""/g, '"');
    }
    return obj;
  });
  return rows;
}

const rows = parseCSV(raw);

const htmlParts = [];
htmlParts.push('<!doctype html>');
htmlParts.push('<html><head><meta charset="utf-8"><title>Voucher Previews</title>');
htmlParts.push('<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px} .card{border:1px solid #ddd;padding:12px;margin-bottom:16px;display:flex;gap:12px;align-items:center} .img{width:220px;height:auto;border:1px solid #ccc} .meta{flex:1} .phone{color:#666}</style>');
htmlParts.push('</head><body>');
htmlParts.push('<h1>Voucher Previews</h1>');

  if (rows.length === 0) {
  htmlParts.push('<p>No candidates found.</p>');
} else {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // compute relative image path from OUT_DIR to project Voucher folder
    let imgRel = r.imagePath.replace(/\\/g, '/');
    // If image path is absolute inside project, make it relative for browser
    const projectRoot = path.resolve(__dirname, '..').replace(/\\/g, '/');
    if (imgRel.startsWith(projectRoot)) {
      imgRel = path.relative(OUT_DIR.replace(/\\/g, '/'), r.imagePath).replace(/\\/g, '/');
    } else {
      // fallback to absolute file URL
      imgRel = 'file:///' + r.imagePath.replace(/\\/g, '/');
    }

    htmlParts.push('<div class="card">');
    htmlParts.push(`<div><img class="img" src="${imgRel}" alt="voucher image"></div>`);
    htmlParts.push('<div class="meta">');
    htmlParts.push(`<h3>${r.nome} <small class="phone">${r.telefone}</small></h3>`);
    htmlParts.push(`<p><strong>Valor:</strong> R$${r.amount} — <strong>Validade:</strong> ${r.expiry.split('T')[0]}</p>`);
    htmlParts.push(`<p>${r.message}</p>`);
    htmlParts.push('</div></div>');
  }
}

htmlParts.push('</body></html>');

const outPath = path.join(OUT_DIR, 'index.html');
fs.writeFileSync(outPath, htmlParts.join('\n'), 'utf8');
console.log('Voucher previews written to', outPath);
