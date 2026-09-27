const http = require('http');
const https = require('https');

const TARGET = process.argv[2] || 'http://localhost:5050';
const url = new URL(TARGET);
const client = url.protocol === 'https:' ? https : http;

function testOptions(origin, path = '/api/Auth/login') {
  return new Promise((resolve) => {
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: path,
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization'
      }
    }, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.end();
  });
}

async function run() {
  console.log('Testing OPTIONS /api/Auth/login on: ' + TARGET);

  const origins = [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8082',
    'https://evil.example.com'
  ];

  for (const origin of origins) {
    const res = await testOptions(origin);
    const allowOrigin = res.headers ? res.headers['access-control-allow-origin'] : undefined;
    const allowMethods = res.headers ? res.headers['access-control-allow-methods'] : undefined;
    const allowHeaders = res.headers ? res.headers['access-control-allow-headers'] : undefined;
    console.log(`\nOrigin: ${origin}`);
    console.log(`Status: ${res.statusCode}`);
    console.log(`Access-Control-Allow-Origin: ${allowOrigin || 'NONE (BLOCKED)'}`);
    console.log(`Access-Control-Allow-Methods: ${allowMethods || 'NONE'}`);
    console.log(`Access-Control-Allow-Headers: ${allowHeaders || 'NONE'}`);
  }

  // Test actual POST request with Origin: http://localhost:8082
  console.log('\n--- Testing POST /api/Auth/demo-login with Origin: http://localhost:8082 ---');
  const postRes = await new Promise((resolve) => {
    const postData = JSON.stringify({});
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/api/Auth/demo-login',
      method: 'POST',
      headers: {
        'Origin': 'http://localhost:8082',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: body
        });
      });
    });
    req.on('error', (err) => resolve({ error: err.message }));
    req.write(postData);
    req.end();
  });

  console.log(`Status: ${postRes.statusCode}`);
  console.log(`Access-Control-Allow-Origin: ${postRes.headers ? postRes.headers['access-control-allow-origin'] : 'NONE'}`);
  let token = null;
  try {
    const json = JSON.parse(postRes.data);
    token = json.data?.accessToken;
    console.log(`Token acquired: ${token ? 'YES' : 'NO'}`);
  } catch (_) {}

  if (token) {
    console.log('\n--- Testing GET /api/Products with Origin: http://localhost:8082 and Bearer Token ---');
    const getRes = await new Promise((resolve) => {
      const req = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/api/Products',
        method: 'GET',
        headers: {
          'Origin': 'http://localhost:8082',
          'Authorization': `Bearer ${token}`
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: body
          });
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.end();
    });
    console.log(`Status: ${getRes.statusCode}`);
    console.log(`Access-Control-Allow-Origin: ${getRes.headers ? getRes.headers['access-control-allow-origin'] : 'NONE'}`);
    try {
      const pJson = JSON.parse(getRes.data);
      console.log(`Products Count: ${pJson.data?.length || 0}`);
    } catch (_) {}
  }
}

run();
