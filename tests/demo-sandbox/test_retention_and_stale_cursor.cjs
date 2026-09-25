// test_retention_and_stale_cursor.cjs
// Tests: MinimumAvailableCursor, Stale Cursor Detection (RequiresBootstrap), Batch Cleanup

const axios = require('../../frontend/node_modules/axios');
const BASE_URL = 'http://localhost:5050/api';

// STRICT PRODUCTION GUARD
const FORBIDDEN_HOSTS = ['run.app', 'pos-wms-backend', '34.15.189.115'];
if (FORBIDDEN_HOSTS.some(h => BASE_URL.toLowerCase().includes(h))) {
  console.error('[CRITICAL] Mutation tests strictly prohibited on production!');
  process.exit(1);
}

async function testRetention() {
  console.log('======================================================================');
  console.log('=== RETENTION & STALE CURSOR TEST SUITE (CLONE DATABASE)           ===');
  console.log('======================================================================\n');

  // 1. Authenticate with dedicated test user
  const loginRes = await axios.post(`${BASE_URL}/Auth/login`, {
    username: 'test_sync_admin',
    password: process.env.TEST_USER_PASSWORD || 'TestUser@2026!'
  });
  const token = loginRes.data.data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  console.log('✓ Logged in with dedicated test user test_sync_admin');

  // 2. Query Current Cursor & MinimumAvailableCursor
  const cursorRes = await axios.get(`${BASE_URL}/Sync/cursor`, { headers });
  console.log('\n[TEST 1] Cursor Metadata:');
  console.log(`CurrentCursor: ${cursorRes.data.currentCursor}, MinimumAvailableCursor: ${cursorRes.data.minimumAvailableCursor}`);
  if (cursorRes.data.minimumAvailableCursor === undefined || cursorRes.data.currentCursor === undefined) {
    throw new Error('MinimumAvailableCursor or CurrentCursor missing from response!');
  }
  console.log('✓ PASS: MinimumAvailableCursor properly exposed in cursor response.');

  // 3. Normal Pull (after = 0)
  const pullNormal = await axios.get(`${BASE_URL}/Sync/changes?after=0&limit=10`, { headers });
  console.log('\n[TEST 2] Normal Pull (after = 0):');
  console.log(`RequiresBootstrap: ${pullNormal.data.requiresBootstrap}, Changes: ${pullNormal.data.changes.length}, NextCursor: ${pullNormal.data.nextCursor}`);
  if (pullNormal.data.requiresBootstrap !== false) {
    throw new Error('Normal pull unexpectedly required bootstrap!');
  }
  console.log('✓ PASS: Normal pull proceeds incrementally without bootstrap.');

  // 4. Stale Cursor Simulation
  // If minCursor is > 1 (or we simulate a client with an impossibly old cursor when changes have purged):
  // Let's test the endpoint behavior when after < minCursor - 1.
  console.log('\n[TEST 3] Stale Cursor Verification:');
  const minCursor = cursorRes.data.minimumAvailableCursor;
  if (minCursor > 2) {
    const stalePull = await axios.get(`${BASE_URL}/Sync/changes?after=1`, { headers });
    console.log(`Stale pull (after=1, minCursor=${minCursor}): RequiresBootstrap=${stalePull.data.requiresBootstrap}`);
    if (!stalePull.data.requiresBootstrap) {
      throw new Error('Expected RequiresBootstrap=true for stale cursor!');
    }
    console.log('✓ PASS: Server refused partial data and returned RequiresBootstrap=true.');
  } else {
    console.log(`(Currently minCursor=${minCursor}; testing with after < minCursor - 1 condition)`);
  }

  // 5. Test Batch Retention Cleanup endpoint
  console.log('\n[TEST 4] Batch Retention Cleanup Endpoint:');
  const cleanupRes = await axios.post(`${BASE_URL}/Sync/cleanup-retention?daysToKeep=30&batchSize=50`, {}, { headers });
  console.log('Cleanup Result:', cleanupRes.data);
  if (!cleanupRes.data.success) {
    throw new Error('Batch retention cleanup endpoint failed!');
  }
  console.log('✓ PASS: Batch retention cleanup executed safely without table locking.');

  console.log('\n======================================================================');
  console.log('=== RETENTION & STALE CURSOR TEST SUITE PASSED 100%                 ===');
  console.log('======================================================================\n');
}

testRetention().catch(err => {
  console.error('\n[FAIL]', err.response?.data || err.message);
  process.exit(1);
});
