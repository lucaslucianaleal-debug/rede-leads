// CommonJS helper for guarding writes to crm_data/shared
const os = require('os');

function now() {
  return new Date().toISOString();
}

function makeMeta(scriptName, who) {
  return {
    who: who || process.env.USER || process.env.USERNAME || 'unknown',
    script: scriptName || 'unknown',
    ts: now(),
    ua: `node ${process.version} ${os.platform()}/${os.arch()}`,
  };
}

function blockIfMissingDoc(docSnap, scriptName) {
  if (!docSnap || !docSnap.exists) {
    const meta = makeMeta(scriptName);
    console.error(`[${scriptName}] Blocked write to crm_data/shared: document not found`, meta);
    throw new Error('Blocked write to crm_data/shared: document not found');
  }
}

function blockIfEmptyArray(arr, scriptName) {
  if (!Array.isArray(arr) || arr.length === 0) {
    const meta = makeMeta(scriptName);
    console.error(`[${scriptName}] Blocked write to crm_data/shared: empty leads array`, meta);
    throw new Error('Blocked write to crm_data/shared: empty leads array');
  }
}

function attachLastWriter(obj, scriptName, who) {
  const meta = makeMeta(scriptName, who);
  return Object.assign({}, obj, { lastWriter: meta });
}

module.exports = {
  blockIfMissingDoc,
  blockIfEmptyArray,
  attachLastWriter,
};
