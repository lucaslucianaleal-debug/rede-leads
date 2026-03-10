const http = require('http');
function post(path, data) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(data || {});
    const opts = { hostname: 'localhost', port: 3001, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(d);
    req.end();
  });
}
(async () => {
  try {
    console.log('Enabling verbose logs...');
    const r1 = await post('/debug/enable-verbose', {});
    console.log('enable-verbose:', r1.status, r1.body);

    // Simulate media for Justina (conversation id 7192862059). Use telefone as the raw digits.
    const telefone = '7192862059';
    const msgId = `sim_${Date.now()}`;
    const body = '[audio:simulated.ogg]';
    console.log('Simulating save-message for', telefone, 'msgId', msgId);
    const r2 = await post('/debug/save-message', { telefone, body, fromMe: false, msgId, targetConversation: '7192862059' });
    console.log('save-message:', r2.status, r2.body);
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
  }
})();
