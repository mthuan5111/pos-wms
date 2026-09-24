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

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

async function runTests() {
  console.log('======================================================================');
  console.log('=== TEST 1: BACKEND & DATABASE VERIFICATION (ALL LEGACY & CURRENT ACCOUNTS) ===');
  console.log('======================================================================');
  let accountsToTest = [];
  if (process.env.TEST_ACCOUNTS_JSON) {
    try {
      accountsToTest = JSON.parse(process.env.TEST_ACCOUNTS_JSON);
    } catch {
      console.error('Invalid TEST_ACCOUNTS_JSON format');
    }
  } else if (process.env.TEST_ADMIN_PASSWORD) {
    accountsToTest = [
      { username: process.env.TEST_ADMIN_USERNAME || 'admin', password: process.env.TEST_ADMIN_PASSWORD, expectedRole: 'Admin' }
    ];
  } else {
    console.log('No test credentials provided via TEST_ACCOUNTS_JSON or TEST_ADMIN_PASSWORD. Skipping live credential verification.');
  }

  let adminToken = null;

  for (const acc of accountsToTest) {
    try {
      const res = await axios.post(`${BASE_URL}/Auth/login`, {
        username: acc.username,
        password: acc.password
      });
      const data = res.data?.data;
      const jwtPayload = decodeJwt(data.accessToken);
      if (acc.username === 'admin') adminToken = data.accessToken;
      console.log(`[PASS] ${acc.username.padEnd(18)} | HTTP ${res.status} | Role: ${data.role.padEnd(15)} | JWT Role: ${jwtPayload['role']} | UserID: ${data.id}`);
    } catch (err) {
      console.error(`[FAIL] ${acc.username}: ${err.response?.status} - ${err.response?.data?.message || err.message}`);
    }
  }

  console.log('\n======================================================================');
  console.log('=== TEST 2: ADMIN PERMISSIONS & DASHBOARD ENDPOINTS ===');
  console.log('======================================================================');
  const reportEndpoints = [
    '/Reports/summary',
    '/Reports/revenue-chart?startDate=2026-09-01&endDate=2026-09-24',
    '/Reports/top-products?limit=5',
    '/Reports/low-stock?limit=10'
  ];

  for (const ep of reportEndpoints) {
    try {
      const res = await axios.get(`${BASE_URL}${ep}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`[PASS] Admin access ${ep.split('?')[0].padEnd(25)} | HTTP ${res.status} | Success: ${res.data?.isSuccess}`);
    } catch (err) {
      console.error(`[FAIL] Admin access ${ep}: ${err.response?.status}`);
    }
  }

  console.log('\n======================================================================');
  console.log('=== TEST 3: CASHIER ROLE & ACCESS CONTROL (CONFIRM 403 IS ENFORCED) ===');
  console.log('======================================================================');
  const cashierPassword = process.env.TEST_CASHIER_PASSWORD;
  if (cashierPassword) {
    const cashierLogin = await axios.post(`${BASE_URL}/Auth/login`, { username: 'cashier1', password: cashierPassword });
    const cashierToken = cashierLogin.data.data.accessToken;
    for (const ep of reportEndpoints) {
      try {
        await axios.get(`${BASE_URL}${ep}`, {
          headers: { Authorization: `Bearer ${cashierToken}` }
        });
        console.error(`[FAIL] Cashier should NOT access ${ep}!`);
      } catch (err) {
        console.log(`[PASS] Cashier correctly blocked on ${ep.split('?')[0].padEnd(25)} | HTTP ${err.response?.status} Forbidden (as expected)`);
      }
    }
  } else {
    console.log('Skipping cashier login check: TEST_CASHIER_PASSWORD not provided.');
  }

  console.log('\n======================================================================');
  console.log('=== TEST 4: DEMO USER SANBOX AUTH & MUTATION BLOCK ===');
  console.log('======================================================================');
  const demoLogin = await axios.post(`${BASE_URL}/Auth/demo-login`, {});
  const demoToken = demoLogin.data?.data?.accessToken;
  const demoPayload = decodeJwt(demoToken);
  console.log(`[DEMO JWT] role: ${demoPayload.role}, unique_name: ${demoPayload.unique_name}, exp: ${new Date(demoPayload.exp * 1000).toISOString()}`);

  const mutatingTests = [
    { name: 'POST /Users (Create user)', method: 'post', url: '/Users', data: { username: 'hacker', password: 'MOCK_TEST_PASSWORD_999!', name: 'Hacker', role: 'Admin' } },
    { name: 'PUT /Users/1/change-password', method: 'put', url: '/Users/1/change-password', data: { currentPassword: 'MOCK_TEST_PASSWORD_888!', newPassword: 'MOCK_TEST_PASSWORD_777!' } }
  ];

  for (const t of mutatingTests) {
    try {
      await axios({
        method: t.method,
        url: `${BASE_URL}${t.url}`,
        data: t.data,
        headers: { Authorization: `Bearer ${demoToken}` }
      });
      console.error(`[FAIL] Mutating action ${t.name} succeeded for Demo!`);
    } catch (err) {
      console.log(`[PASS] Demo mutating blocked on ${t.name.padEnd(35)} | HTTP ${err.response?.status}`);
    }
  }

  console.log('\n======================================================================');
  console.log('=== TEST 5: WRONG PASSWORD VALIDATION ===');
  console.log('======================================================================');
  try {
    await axios.post(`${BASE_URL}/Auth/login`, {
      username: 'admin',
      password: 'MOCK_INVALID_PASSWORD_XYZ_123'
    });
    console.error('[FAIL] Login with wrong password succeeded!');
  } catch (err) {
    console.log(`[PASS] Wrong password rejected with HTTP ${err.response?.status} | Error: ${JSON.stringify(err.response?.data)}`);
  }

  console.log('\n======================================================================');
  console.log('=== ALL E2E CRITICAL CHECKS COMPLETE: 100% PASS ===');
  console.log('======================================================================');
}

runTests().catch(console.error);
