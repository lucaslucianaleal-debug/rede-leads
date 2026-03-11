const http = require('http');
const data = JSON.stringify({ since: '2026-03-09T00:00:00Z' });
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/sync-history',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => (body += chunk));
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(body);
  });
});
req.on('error', (e) => {
  console.error('ERR', e && e.message);
});
req.write(data);
req.end();
