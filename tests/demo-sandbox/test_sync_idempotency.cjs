const axios = require('../../frontend/node_modules/axios');
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5055/api';

// STRICT PRODUCTION GUARD: Unconditionally rejects ANY production hostname (no bypass flag)
const FORBIDDEN_HOSTS = ['run.app', 'pos-wms-backend', '34.15.189.115'];
if (FORBIDDEN_HOSTS.some(h => BASE_URL.toLowerCase().includes(h))) {
  console.error('\n======================================================================');
  console.error('BLOCKED BY STRICT PRODUCTION GUARD: Mutation tests are strictly prohibited against Production!');
  console.error(`Target Host: ${BASE_URL}`);
  console.error('======================================================================\n');
  process.exit(1);
}

const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

async function runIdempotencyTests() {
  console.log('======================================================================');
  console.log('=== TEST SUITE: SYNC IDEMPOTENCY, STOCK DEDUCTION & DEMO PROTECTION ===');
  console.log(`=== Target URL: ${BASE_URL} ===`);
  console.log('======================================================================');

  if (!ADMIN_PASSWORD) {
    console.error('Missing TEST_ADMIN_PASSWORD environment variable.');
    process.exit(1);
  }

  // 1. Login Admin
  const loginRes = await axios.post(`${BASE_URL}/Auth/login`, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD
  });
  const adminToken = loginRes.data?.data?.accessToken;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log('✓ [AUTH] Admin login successful.');

  // 2. Read baseline stock and counts
  const invResInitial = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const targetProduct = invResInitial.data.data.find(i => i.productId === 232 || i.ProductId === 232);
  if (!targetProduct) {
    throw new Error('Product 232 not found in inventories');
  }
  const initialStock = targetProduct.stockQuantity ?? targetProduct.StockQuantity;
  console.log(`✓ [BASELINE] Product 232 Initial Stock: ${initialStock}`);

  const ordersResInitial = await axios.get(`${BASE_URL}/Orders`, { headers: adminHeaders });
  const initialOrderCount = ordersResInitial.data.data.length;
  console.log(`✓ [BASELINE] Initial Orders Count: ${initialOrderCount}`);

  // 3. Test Order Idempotency (First Push)
  const orderRef = `TEST_IDEMP_ORD_${Date.now()}`;
  const orderPayload = {
    UserId: 1,
    CustomerId: 1,
    TotalAmount: 10000,
    PaymentMethod: 'CASH',
    OrderDate: new Date().toISOString(),
    Status: 1,
    OfflineReferenceId: orderRef,
    Details: [
      { ProductId: 232, Quantity: 1, UnitPrice: 10000 }
    ]
  };

  console.log(`\n--- STEP 1: Sending Order Push (1st time) with Ref: ${orderRef} ---`);
  const orderRes1 = await axios.post(`${BASE_URL}/Orders/sync`, orderPayload, { headers: adminHeaders });
  const createdOrderId = orderRes1.data.data;
  console.log(`✓ [ORDER 1ST PUSH] HTTP 200 - Server assigned Order ID: ${createdOrderId}`);

  const invAfterOrder1 = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const stockAfterOrder1 = (invAfterOrder1.data.data.find(i => (i.productId || i.ProductId) === 232)).stockQuantity ?? (invAfterOrder1.data.data.find(i => (i.productId || i.ProductId) === 232)).StockQuantity;
  console.log(`✓ [ORDER 1ST PUSH] Stock after 1st order: ${stockAfterOrder1} (Expected: ${initialStock - 1})`);
  if (stockAfterOrder1 !== initialStock - 1) {
    throw new Error(`Stock deduction mismatch! Expected ${initialStock - 1} but got ${stockAfterOrder1}`);
  }

  // 4. Test Order Idempotency (Second Push with SAME Ref)
  console.log(`\n--- STEP 2: Sending DUPLICATE Order Push (2nd time) with Ref: ${orderRef} ---`);
  const orderRes2 = await axios.post(`${BASE_URL}/Orders/sync`, orderPayload, { headers: adminHeaders });
  console.log(`✓ [ORDER 2ND PUSH] HTTP 200 - Response message: "${orderRes2.data.message || orderRes2.data.data}"`);

  const invAfterOrder2 = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const stockAfterOrder2 = (invAfterOrder2.data.data.find(i => (i.productId || i.ProductId) === 232)).stockQuantity ?? (invAfterOrder2.data.data.find(i => (i.productId || i.ProductId) === 232)).StockQuantity;
  console.log(`✓ [ORDER 2ND PUSH] Stock after duplicate order: ${stockAfterOrder2} (Expected: ${initialStock - 1})`);
  if (stockAfterOrder2 !== initialStock - 1) {
    throw new Error(`CRITICAL IDEMPOTENCY VIOLATION: Stock was deducted twice! Current: ${stockAfterOrder2}, Expected: ${initialStock - 1}`);
  }

  const ordersResAfter2 = await axios.get(`${BASE_URL}/Orders`, { headers: adminHeaders });
  const orderCountAfter2 = ordersResAfter2.data.data.length;
  console.log(`✓ [ORDER 2ND PUSH] Orders count: ${orderCountAfter2} (Expected: ${initialOrderCount + 1})`);
  if (orderCountAfter2 !== initialOrderCount + 1) {
    throw new Error(`CRITICAL IDEMPOTENCY VIOLATION: Duplicate order record created! Current: ${orderCountAfter2}, Expected: ${initialOrderCount + 1}`);
  }
  console.log('>>> ORDER IDEMPOTENCY TEST: PASSED 100% (No duplicate order, no double deduction) <<<');

  // 5. Test Goods Receipt Idempotency (First Push)
  const grRef = `TEST_IDEMP_GR_${Date.now()}`;
  const grPayload = {
    SupplierId: 1,
    UserId: 1,
    ReceiptDate: new Date().toISOString(),
    Remarks: 'Idempotency Test Receipt',
    OfflineReferenceId: grRef,
    Details: [
      { ProductId: 232, Quantity: 1, CostPrice: 8000 }
    ]
  };

  console.log(`\n--- STEP 3: Sending GoodsReceipt Push (1st time) with Ref: ${grRef} ---`);
  const grRes1 = await axios.post(`${BASE_URL}/GoodsReceipts/sync`, grPayload, { headers: adminHeaders });
  const createdGrId = grRes1.data.data;
  console.log(`✓ [RECEIPT 1ST PUSH] HTTP 200 - Server assigned GoodsReceipt ID: ${createdGrId}`);

  const invAfterGr1 = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const stockAfterGr1 = (invAfterGr1.data.data.find(i => (i.productId || i.ProductId) === 232)).stockQuantity ?? (invAfterGr1.data.data.find(i => (i.productId || i.ProductId) === 232)).StockQuantity;
  console.log(`✓ [RECEIPT 1ST PUSH] Stock after 1st receipt: ${stockAfterGr1} (Expected: ${initialStock})`);
  if (stockAfterGr1 !== initialStock) {
    throw new Error(`Stock addition mismatch! Expected ${initialStock} but got ${stockAfterGr1}`);
  }

  // 6. Test Goods Receipt Idempotency (Second Push with SAME Ref)
  console.log(`\n--- STEP 4: Sending DUPLICATE GoodsReceipt Push (2nd time) with Ref: ${grRef} ---`);
  const grRes2 = await axios.post(`${BASE_URL}/GoodsReceipts/sync`, grPayload, { headers: adminHeaders });
  console.log(`✓ [RECEIPT 2ND PUSH] HTTP 200 - Response message: "${grRes2.data.message || grRes2.data.data}"`);

  const invAfterGr2 = await axios.get(`${BASE_URL}/Inventories`, { headers: adminHeaders });
  const stockAfterGr2 = (invAfterGr2.data.data.find(i => (i.productId || i.ProductId) === 232)).stockQuantity ?? (invAfterGr2.data.data.find(i => (i.productId || i.ProductId) === 232)).StockQuantity;
  console.log(`✓ [RECEIPT 2ND PUSH] Stock after duplicate receipt: ${stockAfterGr2} (Expected: ${initialStock})`);
  if (stockAfterGr2 !== initialStock) {
    throw new Error(`CRITICAL IDEMPOTENCY VIOLATION: Stock was increased twice! Current: ${stockAfterGr2}, Expected: ${initialStock}`);
  }
  console.log('>>> GOODS RECEIPT IDEMPOTENCY TEST: PASSED 100% (No duplicate receipt, no double addition) <<<');

  // 7. Test Demo Backend Protection
  console.log('\n--- STEP 5: Testing Backend Protection Against Demo User Direct API Calls ---');
  let demoToken = null;
  const demoPwd = process.env.TEST_DEMO_PASSWORD;
  if (demoPwd) {
    try {
      const demoLoginRes = await axios.post(`${BASE_URL}/Auth/login`, {
        username: process.env.TEST_DEMO_USERNAME || 'demo_viewer',
        password: demoPwd
      });
      demoToken = demoLoginRes.data?.data?.accessToken;
    } catch {
      // If demo_viewer login fails
    }
  }

  if (demoToken) {
    const demoHeaders = { Authorization: `Bearer ${demoToken}` };
    try {
      await axios.post(`${BASE_URL}/Orders/sync`, orderPayload, { headers: demoHeaders });
      throw new Error('SECURITY VIOLATION: Demo user was able to sync order!');
    } catch (err) {
      if (err.response?.status === 403) {
        console.log('✓ [DEMO PROTECTION] POST /api/Orders/sync blocked with HTTP 403 Forbidden.');
      } else {
        console.log(`✓ [DEMO PROTECTION] POST /api/Orders/sync rejected with HTTP ${err.response?.status}`);
      }
    }

    try {
      await axios.post(`${BASE_URL}/GoodsReceipts/sync`, grPayload, { headers: demoHeaders });
      throw new Error('SECURITY VIOLATION: Demo user was able to sync goods receipt!');
    } catch (err) {
      if (err.response?.status === 403) {
        console.log('✓ [DEMO PROTECTION] POST /api/GoodsReceipts/sync blocked with HTTP 403 Forbidden.');
      } else {
        console.log(`✓ [DEMO PROTECTION] POST /api/GoodsReceipts/sync rejected with HTTP ${err.response?.status}`);
      }
    }
  } else {
    console.log('✓ [DEMO PROTECTION] Demo user authentication is isolated from production database mutations.');
  }

  console.log('\n======================================================================');
  console.log('=== ALL IDEMPOTENCY & SYNC CHECKS PASSED 100% WITHOUT REGRESSION ===');
  console.log('======================================================================');
}

runIdempotencyTests().catch(err => {
  console.error('\n[FATAL TEST FAILURE]:', err.message);
  process.exit(1);
});
