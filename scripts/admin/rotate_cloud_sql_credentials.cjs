// ==============================================================================
// RESTRICTED ADMIN SCRIPT: IN-MEMORY CLOUD SQL CREDENTIAL ROTATION
// Path: scripts/admin/rotate_cloud_sql_credentials.cjs
// Security: NEVER run in CI/CD, NEVER run in automated test suites.
// Requirements: Active authorized gcloud session, explicit confirmation token.
// ==============================================================================

const crypto = require('crypto');
const { execSync } = require('child_process');
const axios = require('../../frontend/node_modules/axios');

const EXPECTED_PROJECT_ID = 'project-d7df6a92-6e2f-434b-802';
const EXPECTED_INSTANCE_ID = 'pos-wms-db';
const SECRET_NAME = 'pos-wms-db-conn';

// 1. Guard against accidental test execution
if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
  console.error('[SECURITY ERROR] This administrative script cannot be executed within a test suite.');
  process.exit(1);
}

// 2. Guard: Explicit confirmation flag required
const hasConfirmFlag = process.argv.includes('--confirm-production-rotation') || process.env.CONFIRM_PRODUCTION_ROTATION === 'true';
if (!hasConfirmFlag) {
  console.error('\n[ACCESS DENIED] Missing explicit operation confirmation.');
  console.error('Usage: node scripts/admin/rotate_cloud_sql_credentials.cjs --confirm-production-rotation\n');
  process.exit(1);
}

function generateSecurePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!#$%*-_+';
  const all = upper + lower + digits + special;

  let pwdChars = [];
  for (let i = 0; i < 4; i++) {
    pwdChars.push(upper[crypto.randomInt(upper.length)]);
    pwdChars.push(lower[crypto.randomInt(lower.length)]);
    pwdChars.push(digits[crypto.randomInt(digits.length)]);
    pwdChars.push(special[crypto.randomInt(special.length)]);
  }
  while (pwdChars.length < 32) {
    pwdChars.push(all[crypto.randomInt(all.length)]);
  }
  for (let i = pwdChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pwdChars[i], pwdChars[j]] = [pwdChars[j], pwdChars[i]];
  }
  return pwdChars.join('');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rotateCredentials() {
  console.log('======================================================================');
  console.log('=== AUTHORIZED CLOUD SQL CREDENTIAL ROTATION (ADMIN CONSOLE)       ===');
  console.log('======================================================================\n');

  // Check active gcloud account & project
  const activeAccount = execSync('gcloud.cmd config get-value account', { encoding: 'utf8' }).trim();
  const activeProject = execSync('gcloud.cmd config get-value project', { encoding: 'utf8' }).trim();
  console.log(`[AUTH CHECK] Active Account: ${activeAccount}`);
  console.log(`[AUTH CHECK] Active Project: ${activeProject}`);

  if (activeProject !== EXPECTED_PROJECT_ID) {
    throw new Error(`Project mismatch! Expected ${EXPECTED_PROJECT_ID}, got ${activeProject}`);
  }

  console.log('\n[STEP 1] Generating high-entropy database password in memory...');
  let newPassword = generateSecurePassword();
  console.log('✓ Password generated in memory (32 chars, high entropy, zero disk write).');

  console.log('\n[STEP 2] Acquiring short-lived Google Cloud OAuth token...');
  const token = execSync('gcloud.cmd auth print-access-token', { encoding: 'utf8' }).trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('✓ Access token acquired.');

  console.log('\n[STEP 3] Updating Cloud SQL user sqlserver via Admin API...');
  const updateRes = await axios.put(
    `https://sqladmin.googleapis.com/v1/projects/${EXPECTED_PROJECT_ID}/instances/${EXPECTED_INSTANCE_ID}/users?name=sqlserver`,
    { name: 'sqlserver', password: newPassword },
    { headers }
  );

  const opName = updateRes.data.name;
  console.log(`Cloud SQL Operation: ${opName}. Polling until DONE...`);

  let opStatus = updateRes.data.status;
  while (opStatus !== 'DONE') {
    await sleep(3000);
    const opRes = await axios.get(
      `https://sqladmin.googleapis.com/v1/projects/${EXPECTED_PROJECT_ID}/operations/${opName}`,
      { headers }
    );
    opStatus = opRes.data.status;
    if (opRes.data.error) {
      throw new Error(`Cloud SQL Operation failed: ${JSON.stringify(opRes.data.error)}`);
    }
  }
  console.log('✓ Cloud SQL database user credentials updated successfully.');

  console.log('\n[STEP 4] Adding new version to Secret Manager pos-wms-db-conn...');
  let newConnString = `Server=34.15.189.115;Database=POS_WMS_DB;User Id=sqlserver;Password=${newPassword};TrustServerCertificate=True;MultipleActiveResultSets=True;`;
  
  const addVersionRes = await axios.post(
    `https://secretmanager.googleapis.com/v1/projects/${EXPECTED_PROJECT_ID}/secrets/${SECRET_NAME}:addVersion`,
    {
      payload: {
        data: Buffer.from(newConnString).toString('base64')
      }
    },
    { headers }
  );

  const newVersionName = addVersionRes.data.name;
  console.log(`✓ Secret Manager updated: ${newVersionName}`);

  // Immediate in-memory scrubbing
  newPassword = null;
  newConnString = null;

  console.log('\n======================================================================');
  console.log('=== ROTATION COMPLETED SECURELY WITH ZERO EXPOSURE                 ===');
  console.log('======================================================================\n');
}

rotateCredentials().catch(err => {
  console.error('\n[FATAL ERROR]', err.response?.data || err.message);
  process.exit(1);
});
