// tests/demo-sandbox/test_canary_auth.cjs
// Automated verification of Cloud Run Canary deployment without printing tokens or secrets

const https = require('https');

const CANARY_HOST = process.argv[2] || 'pos-wms-backend-uqq7uwnf7a-as.a.run.app';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log(`[INFO] Testing Cloud Run Canary: https://${CANARY_HOST}`);

  // 1. Test Login to get fresh Demo token
  console.log('[STEP 1] Testing Demo login (POST /api/Auth/login)...');
  const loginRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, {
    username: process.env.TEST_DEMO_USERNAME || 'demo_viewer',
    password: process.env.TEST_DEMO_PASSWORD || 'Demo@123'
  });

  console.log(`Login HTTP Status: ${loginRes.statusCode}`);
  if (loginRes.statusCode !== 200) {
    console.error(`[FAIL] Login failed: ${loginRes.body}`);
    process.exit(1);
  }

  const loginJson = JSON.parse(loginRes.body);
  const freshToken = loginJson.data?.accessToken || loginJson.data?.AccessToken;
  if (!freshToken) {
    console.error('[FAIL] No token in login response! Keys: ' + Object.keys(loginJson.data || {}));
    process.exit(1);
  }
  console.log('[SUCCESS] Successfully obtained fresh dynamic Demo JWT (length: ' + freshToken.length + ' chars, not printed)');

  // 2. Test Old Token Rejection (simulate old token signed with previous plaintext key)
  console.log('\n[STEP 2] Testing Old / Invalid Key Token Rejection (expect 401)...');
  // Dummy token with old/invalid signature
  const dummyOldToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vX3ZpZXdlciIsImp0aSI6Im9sZC1pZCIsImV4cCI6MTk5OTk5OTk5OSwiaXNzIjoiUE9TX1dNU19CYWNrZW5kIiwiYXVkIjoiUE9TX1dNU19Nb2JpbGVBcHAiLCJyb2xlIjoiRGVtb1VzZXIifQ.INVALIDSIGNATUREFORROTATEDKEY1234567890';
  const oldTokenRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Categories',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${dummyOldToken}`
    }
  });
  console.log(`Old Token GET /api/Categories Status: ${oldTokenRes.statusCode} (Expected 401)`);
  if (oldTokenRes.statusCode !== 401) {
    console.error(`[FAIL] Expected 401 Unauthorized for old token, got ${oldTokenRes.statusCode}`);
    process.exit(1);
  }
  console.log('[SUCCESS] Rotated key successfully rejects old/invalid signatures with 401');

  // 3. Test Read Endpoints with fresh token (expect 200)
  console.log('\n[STEP 3] Testing Read Endpoints with Demo token...');
  const catRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Categories',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${freshToken}` }
  });
  console.log(`GET /api/Categories Status: ${catRes.statusCode}`);

  const prodRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Products',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${freshToken}` }
  });
  console.log(`GET /api/Products Status: ${prodRes.statusCode}`);

  if (catRes.statusCode !== 200 || prodRes.statusCode !== 200) {
    console.error('[FAIL] Read endpoints failed for Demo user!');
    process.exit(1);
  }
  console.log('[SUCCESS] Demo user can read categories and products');

  // 4. Test Shifts Endpoints Authorization (expect 403)
  console.log('\n[STEP 4] Testing Shifts Authorization for Demo user (must be 403 Forbidden)...');
  
  // POST /api/Shifts/open
  const openShiftRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Shifts/open',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { initialCash: 100000 });
  console.log(`POST /api/Shifts/open Status: ${openShiftRes.statusCode} (Expected 403)`);

  // POST /api/Shifts/close
  const closeShiftRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Shifts/close',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { actualCash: 100000, closingRemarks: "Test" });
  console.log(`POST /api/Shifts/close Status: ${closeShiftRes.statusCode} (Expected 403)`);

  // POST /api/Shifts/1/end
  const endShiftRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Shifts/1/end',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { actualCash: 100000, closingRemarks: "Test" });
  console.log(`POST /api/Shifts/1/end Status: ${endShiftRes.statusCode} (Expected 403)`);

  if (openShiftRes.statusCode !== 403 || closeShiftRes.statusCode !== 403 || endShiftRes.statusCode !== 403) {
    console.error(`[FAIL] Shifts authorization failed! open=${openShiftRes.statusCode}, close=${closeShiftRes.statusCode}, end=${endShiftRes.statusCode}`);
    process.exit(1);
  }
  console.log('[SUCCESS] All Shifts mutation endpoints correctly return 403 Forbidden for Demo');

  // 5. Test Other Mutating Endpoints (expect 403)
  console.log('\n[STEP 5] Testing Other Mutation Endpoints for Demo user...');
  const orderSyncRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Orders/sync',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { totalAmount: 10000 });
  console.log(`POST /api/Orders/sync Status: ${orderSyncRes.statusCode} (Expected 403)`);

  const grSyncRes = await request({
    hostname: CANARY_HOST,
    path: '/api/GoodsReceipts/sync',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { totalAmount: 10000 });
  console.log(`POST /api/GoodsReceipts/sync Status: ${grSyncRes.statusCode} (Expected 403)`);

  const invAdjRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Inventories/adjust',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { productId: 1, quantityChange: 1 });
  console.log(`POST /api/Inventories/adjust Status: ${invAdjRes.statusCode} (Expected 403)`);

  const createSuppRes = await request({
    hostname: CANARY_HOST,
    path: '/api/Suppliers',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshToken}`
    }
  }, { name: "Test Supplier" });
  console.log(`POST /api/Suppliers Status: ${createSuppRes.statusCode} (Expected 403)`);

  if (orderSyncRes.statusCode !== 403 || grSyncRes.statusCode !== 403 || invAdjRes.statusCode !== 403 || createSuppRes.statusCode !== 403) {
    console.error('[FAIL] Mutating endpoint did not return 403 for Demo!');
    process.exit(1);
  }
  console.log('[SUCCESS] All mutation endpoints returned 403 Forbidden for Demo');

  console.log('\n======================================================');
  console.log('ALL CANARY AUTHORIZATION VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('[UNEXPECTED ERROR]', err);
  process.exit(1);
});
