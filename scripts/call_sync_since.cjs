const http = require('http');
const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const data = JSON.stringify({ since });
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
