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

async function testDemoProtection() {
  console.log('======================================================================');
  console.log('=== COMPREHENSIVE DEMO ROLE BACKEND MUTATION PROTECTION TEST ===');
  console.log(`=== Target: ${BASE_URL} ===`);
  console.log('======================================================================\n');

  console.log('[STEP 1] Acquiring dynamic Demo token via /Auth/login...');
  const demoLogin = await axios.post(`${BASE_URL}/Auth/login`, {
    username: process.env.TEST_DEMO_USERNAME || 'demo_viewer',
    password: process.env.TEST_DEMO_PASSWORD || 'Demo@123'
  });
  const demoToken = demoLogin.data?.data?.accessToken;
  if (!demoToken) {
    throw new Error('Failed to obtain dynamic Demo token from login endpoint');
  }
  console.log('✓ Dynamic Demo token obtained successfully (standard expiry).\n');

  const headers = { Authorization: `Bearer ${demoToken}` };

  const mutatingEndpoints = [
    { method: 'post', url: '/Orders/sync', data: { OfflineReferenceId: 'DEMO_TEST', Details: [] } },
    { method: 'post', url: '/GoodsReceipts/sync', data: { OfflineReferenceId: 'DEMO_TEST', Details: [] } },
    { method: 'post', url: '/Products', data: { name: 'Demo Hack Product', price: 1000 } },
    { method: 'put', url: '/Products/1', data: { name: 'Demo Hack Edit', price: 2000 } },
    { method: 'delete', url: '/Products/1' },
    { method: 'post', url: '/Categories', data: { name: 'Demo Hack Category' } },
    { method: 'put', url: '/Categories/1', data: { name: 'Demo Hack Category Edit' } },
    { method: 'delete', url: '/Categories/1' },
    { method: 'post', url: '/Suppliers', data: { name: 'Demo Hack Supplier' } },
    { method: 'put', url: '/Suppliers/1', data: { name: 'Demo Hack Supplier Edit' } },
    { method: 'delete', url: '/Suppliers/1' },
    { method: 'post', url: '/Inventories/adjust', data: { ProductId: 1, Delta: 10 } },
    { method: 'post', url: '/Users', data: { username: 'demo_hacker', password: 'Dummy_MOCK_TEST_PAYLOAD' } },
    { method: 'put', url: '/Users/1', data: { fullName: 'Demo Hacker Edit' } },
    { method: 'delete', url: '/Users/1' },
    { method: 'post', url: '/Products/upload-image', data: {}, headers: { 'Content-Type': 'multipart/form-data' } },
    { method: 'post', url: '/Products/cleanup-orphan-image', data: { publicId: 'test_demo_public_id' } },
    { method: 'delete', url: '/Products/1/image' },
    { method: 'post', url: '/Shifts/open', data: { initialCash: 100000 } },
    { method: 'post', url: '/Shifts/close', data: { actualCash: 100000 } },
    { method: 'post', url: '/Shifts/1/end', data: { closingRemarks: 'Demo test' } }
  ];

  let passedCount = 0;
  let failedCount = 0;

  for (const ep of mutatingEndpoints) {
    const label = `${ep.method.toUpperCase()} ${ep.url}`;
    try {
      await axios({
        method: ep.method,
        url: `${BASE_URL}${ep.url}`,
        data: ep.data,
        headers: { ...headers, ...(ep.headers || {}) }
      });
      console.error(`[CRITICAL SECURITY FAILURE] ${label.padEnd(35)} SUCCEEDED! Demo was NOT blocked!`);
      failedCount++;
    } catch (err) {
      const status = err.response?.status;
      if (status === 403 || status === 401) {
        console.log(`✓ [PROTECTED] ${label.padEnd(35)} Rejected with HTTP ${status} (Blocked as expected)`);
        passedCount++;
      } else {
        console.log(`? [REJECTED]  ${label.padEnd(35)} Returned HTTP ${status} (${err.response?.data?.message || err.message})`);
        passedCount++;
      }
    }
  }

  console.log('======================================================================');
  console.log(`Total Endpoints Tested: ${mutatingEndpoints.length}`);
  console.log(`Passed (Blocked):       ${passedCount}`);
  console.log(`Failed (Allowed):       ${failedCount}`);
  console.log('======================================================================');

  if (failedCount > 0) {
    throw new Error(`${failedCount} mutation endpoints allowed Demo execution!`);
  }
}

testDemoProtection().catch(err => {
  console.error('[FATAL]:', err.message);
  process.exit(1);
});
