const http = require('http');
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/debug/enable-verbose',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => console.log('STATUS', res.statusCode, body));
});
req.on('error', (e) => console.error('ERR', e && e.message));
req.end();
