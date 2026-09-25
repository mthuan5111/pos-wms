// ==============================================================================
// IN-MEMORY CLOUD SQL CREDENTIAL ROTATION & SECRET MANAGER UPDATE
// Path: tests/demo-sandbox/rotate_cloud_sql_credentials.cjs
// Strict security: NO password printed, NO password in args, NO password in history.
// ==============================================================================

const crypto = require('crypto');
const { execSync } = require('child_process');
const axios = require('../../frontend/node_modules/axios');

const PROJECT_ID = 'project-d7df6a92-6e2f-434b-802';
const INSTANCE_ID = 'pos-wms-db';
const SECRET_NAME = 'pos-wms-db-conn';

function generateSecurePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!#$%*-_+';
  const all = upper + lower + digits + special;

  let pwdChars = [];
  // Ensure at least 4 of each character class
  for (let i = 0; i < 4; i++) {
    pwdChars.push(upper[crypto.randomInt(upper.length)]);
    pwdChars.push(lower[crypto.randomInt(lower.length)]);
    pwdChars.push(digits[crypto.randomInt(digits.length)]);
    pwdChars.push(special[crypto.randomInt(special.length)]);
  }
  // Fill up to 32 characters
  while (pwdChars.length < 32) {
    pwdChars.push(all[crypto.randomInt(all.length)]);
  }
  // Cryptographic Fisher-Yates shuffle
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
  console.log('=== SECURE CLOUD SQL CREDENTIAL ROTATION (IN-MEMORY ONLY)          ===');
  console.log('======================================================================\n');

  console.log('[STEP 1] Generating high-entropy database password in memory...');
  let newPassword = generateSecurePassword();
  console.log('✓ Password generated (32 characters, high-entropy, compliant with SQL Server policy).');
  console.log('✓ Security check: Password is strictly held in memory and will NOT be logged.\n');

  console.log('[STEP 2] Acquiring Google Cloud access token...');
  const token = execSync('gcloud.cmd auth print-access-token', { encoding: 'utf8' }).trim();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('✓ Access token acquired.\n');

  console.log('[STEP 3] Updating Cloud SQL user sqlserver via Admin API...');
  const updateRes = await axios.put(
    `https://sqladmin.googleapis.com/v1/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users?name=sqlserver`,
    { name: 'sqlserver', password: newPassword },
    { headers }
  );

  const opName = updateRes.data.name;
  console.log(`Cloud SQL Operation launched: ${opName}`);
  console.log('Polling operation until DONE...');

  let opStatus = updateRes.data.status;
  while (opStatus !== 'DONE') {
    await sleep(3000);
    const opRes = await axios.get(
      `https://sqladmin.googleapis.com/v1/projects/${PROJECT_ID}/operations/${opName}`,
      { headers }
    );
    opStatus = opRes.data.status;
    process.stdout.write(`Status: ${opStatus}... `);
    if (opRes.data.error) {
      throw new Error(`Cloud SQL Operation failed: ${JSON.stringify(opRes.data.error)}`);
    }
  }
  console.log('\n✓ Cloud SQL database user credentials updated successfully.\n');

  console.log('[STEP 4] Updating Secret Manager secret pos-wms-db-conn...');
  let newConnString = `Server=34.15.189.115;Database=POS_WMS_DB;User Id=sqlserver;Password=${newPassword};TrustServerCertificate=True;MultipleActiveResultSets=True;`;
  
  const addVersionRes = await axios.post(
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${SECRET_NAME}:addVersion`,
    {
      payload: {
        data: Buffer.from(newConnString).toString('base64')
      }
    },
    { headers }
  );

  const newVersionName = addVersionRes.data.name;
  console.log(`✓ Secret Manager updated with new version: ${newVersionName}\n`);

  // Overwrite memory
  newPassword = null;
  newConnString = null;

  console.log('======================================================================');
  console.log('=== ROTATION COMPLETED SUCCESSFULLY WITHOUT EXPOSING CREDENTIALS   ===');
  console.log('======================================================================\n');
}

rotateCredentials().catch(err => {
  console.error('\n[ERROR] Rotation failed:', err.response?.data || err.message);
  process.exit(1);
});
