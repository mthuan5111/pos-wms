// tests/demo-sandbox/verify_production_readonly.cjs
// Read-only smoke test and metrics verification against Cloud Run production

const https = require('https');

const HOST = 'pos-wms-backend-uqq7uwnf7a-as.a.run.app';

function request(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = https.request({
      hostname: HOST,
      path: path,
      method: 'GET',
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function login(username, password) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ username, password });
    const req = https.request({
      hostname: HOST,
      path: '/api/Auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function verify() {
  console.log(`[INFO] Connecting to Cloud Run production: https://${HOST}`);

  // 1. Login with demo user
  const loginRes = await login(
    process.env.TEST_DEMO_USERNAME || 'demo_viewer',
    process.env.TEST_DEMO_PASSWORD || 'Demo@123'
  );
  if (loginRes.status !== 200 || !loginRes.data?.data?.accessToken) {
    console.error(`[FAIL] Login failed: HTTP ${loginRes.status}`);
    process.exit(1);
  }
  const token = loginRes.data.data.accessToken;
  console.log('[PASS] Demo login successful, acquired dynamic JWT');

  // 2. Query Products
  const prodRes = await request('/api/Products', token);
  const products = prodRes.data?.data || [];
  console.log(`[VERIFY] Products Count: ${products.length} (Baseline: 38)`);

  // 3. Query Categories
  const catRes = await request('/api/Categories', token);
  const categories = catRes.data?.data || [];
  console.log(`[VERIFY] Categories Count: ${categories.length} (Baseline: 8)`);

  // 4. Query Suppliers
  const suppRes = await request('/api/Suppliers', token);
  const suppliers = suppRes.data?.data || [];
  console.log(`[VERIFY] Suppliers Count: ${suppliers.length} (Baseline: 7)`);

  // 5. Query Inventories
  const invRes = await request('/api/Inventories', token);
  const inventories = invRes.data?.data || [];
  console.log(`[VERIFY] Inventories Count: ${inventories.length} (Baseline: 38)`);

  const prod232Inv = inventories.find(i => i.productId === 232);
  const prod232Stock = prod232Inv ? prod232Inv.stockQuantity : 'N/A';
  console.log(`[VERIFY] Product 232 Stock Quantity: ${prod232Stock} (Baseline: 99)`);

  // 6. Query Orders
  const orderRes = await request('/api/Orders', token);
  const orders = orderRes.data?.data || [];
  console.log(`[VERIFY] Orders Count: ${orders.length} (Baseline: 29)`);

  let totalRevenue = 0;
  for (const o of orders) {
    totalRevenue += (o.totalAmount || 0);
  }
  console.log(`[VERIFY] Total Order Revenue: ${totalRevenue.toLocaleString('vi-VN')} VND (Baseline: 2.656.000 VND)`);

  // 7. Query GoodsReceipts
  const grRes = await request('/api/GoodsReceipts', token);
  const goodsReceipts = grRes.data?.data || [];
  console.log(`[VERIFY] GoodsReceipts Count: ${goodsReceipts.length} (Baseline: 5)`);

  // Baseline comparisons
  let allMatched = true;
  if (products.length !== 38) { console.error('[MISMATCH] Products'); allMatched = false; }
  if (categories.length !== 8) { console.error('[MISMATCH] Categories'); allMatched = false; }
  if (suppliers.length !== 7) { console.error('[MISMATCH] Suppliers'); allMatched = false; }
  if (inventories.length !== 38) { console.error('[MISMATCH] Inventories'); allMatched = false; }
  if (prod232Stock !== 99) { console.error('[MISMATCH] Product 232 Stock'); allMatched = false; }
  if (orders.length !== 29) { console.error('[MISMATCH] Orders'); allMatched = false; }
  if (totalRevenue !== 2656000) { console.error('[MISMATCH] Total Revenue'); allMatched = false; }
  if (goodsReceipts.length !== 5) { console.error('[MISMATCH] GoodsReceipts'); allMatched = false; }

  if (allMatched) {
    console.log('\n======================================================');
    console.log('ALL PRODUCTION READ-ONLY METRICS MATCH 100% BASELINE!');
    console.log('======================================================');
  } else {
    console.error('\n[ERROR] Production baseline mismatch detected!');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('[UNEXPECTED ERROR]', err);
  process.exit(1);
});
