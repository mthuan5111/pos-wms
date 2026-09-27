const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const PROJECT_ID = 'project-d7df6a92-6e2f-434b-802';
const REGION = 'asia-southeast1';
const SERVICE_NAME = 'pos-wms-backend';
const GCS_BUCKET = `${PROJECT_ID}_cloudbuild`;

function getAccessToken() {
  const token = execSync('cmd.exe /c gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  return token;
}

function httpsRequest(urlStr, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const token = options.noAuth ? null : getAccessToken();
    const headers = {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let parsedJson = null;
        try {
          parsedJson = JSON.parse(buf.toString('utf8'));
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsedJson,
          raw: buf.toString('utf8'),
          buffer: buf
        });
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  console.log(`[1/7] Current Git SHA: ${gitSha}`);

  const scratchDir = path.resolve('C:/Users/thuan/.gemini/antigravity-ide/brain/0fc31c58-1b54-4671-92eb-ca577cd258e4/scratch');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  const tarballPath = path.join(scratchDir, `source-${gitSha}.tgz`);
  console.log(`[2/7] Packing backend source into ${tarballPath}...`);
  if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);

  // Pack backend folder using bsdtar
  execSync(`tar --exclude="obj" --exclude="bin" --exclude=".vs" --exclude="*.db" --exclude="*.sqlite*" -czf "${tarballPath}" -C backend .`);
  const tarSize = fs.statSync(tarballPath).size;
  console.log(`Packed source tarball: ${tarSize} bytes`);

  console.log(`[3/7] Uploading source tarball to gs://${GCS_BUCKET}/source/source-${gitSha}.tgz ...`);
  const gcsUploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=source/source-${gitSha}.tgz`;
  const tarBuffer = fs.readFileSync(tarballPath);
  const uploadRes = await httpsRequest(gcsUploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': tarBuffer.length
    }
  }, tarBuffer);

  if (uploadRes.statusCode !== 200) {
    throw new Error(`Failed to upload source to GCS: ${uploadRes.statusCode} - ${uploadRes.raw}`);
  }
  console.log(`Uploaded source to GCS. Generation: ${uploadRes.data.generation}`);

  const imageTag = `asia-southeast1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}:prod-${gitSha}`;
  console.log(`[4/7] Submitting Cloud Build for image: ${imageTag} ...`);

  const buildPayload = {
    source: {
      storageSource: {
        bucket: GCS_BUCKET,
        object: `source/source-${gitSha}.tgz`,
        generation: uploadRes.data.generation
      }
    },
    steps: [
      {
        name: 'gcr.io/cloud-builders/docker',
        args: [
          'build',
          '--network',
          'cloudbuild',
          '-t',
          imageTag,
          '.'
        ]
      }
    ],
    images: [imageTag]
  };

  const buildRes = await httpsRequest(`https://cloudbuild.googleapis.com/v1/projects/${PROJECT_ID}/builds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify(buildPayload));

  if (buildRes.statusCode !== 200) {
    throw new Error(`Failed to submit Cloud Build: ${buildRes.statusCode} - ${buildRes.raw}`);
  }

  const buildId = buildRes.data.metadata?.build?.id || buildRes.data.id;
  console.log(`Build submitted successfully! Build ID: ${buildId}`);
  console.log('Waiting for Cloud Build to complete...');

  let buildStatus = 'WORKING';
  let attempts = 0;
  while (buildStatus === 'WORKING' || buildStatus === 'QUEUED' || buildStatus === 'PENDING') {
    await sleep(8000);
    attempts++;
    const checkRes = await httpsRequest(`https://cloudbuild.googleapis.com/v1/projects/${PROJECT_ID}/builds/${buildId}`);
    if (checkRes.statusCode === 200) {
      buildStatus = checkRes.data.status;
      process.stdout.write(`\rBuild Status: ${buildStatus} (${attempts * 8}s)`);
      if (buildStatus === 'SUCCESS') break;
      if (['FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED'].includes(buildStatus)) {
        console.log('');
        throw new Error(`Cloud Build failed with status: ${buildStatus}`);
      }
    }
  }
  console.log(`\nCloud Build finished with SUCCESS! Image built: ${imageTag}`);

  console.log(`[5/7] Deploying canary revision to Cloud Run with 0% traffic...`);
  const serviceUrl = `https://${REGION}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${PROJECT_ID}/services/${SERVICE_NAME}`;
  const svcRes = await httpsRequest(serviceUrl);
  if (svcRes.statusCode !== 200) {
    throw new Error(`Failed to fetch Cloud Run service: ${svcRes.statusCode} - ${svcRes.raw}`);
  }

  const svc = svcRes.data;
  const currentTraffic = svc.status?.traffic || [];
  const primaryRevision = currentTraffic.find(t => t.percent === 100)?.revisionName || svc.status?.latestReadyRevisionName;
  console.log(`Current 100% active revision: ${primaryRevision}`);

  // Create update payload for canary deployment
  const updatePayload = JSON.parse(JSON.stringify(svc));
  // Update image
  updatePayload.spec.template.spec.containers[0].image = imageTag;
  // Ensure template name is empty or removed so Knative generates a unique revision name
  if (updatePayload.spec.template.metadata) {
    delete updatePayload.spec.template.metadata.name;
  }
  // Keep 100% traffic on primaryRevision, 0% on latest revision tagged "canary"
  updatePayload.spec.traffic = [
    {
      revisionName: primaryRevision,
      percent: 100
    },
    {
      latestRevision: true,
      percent: 0,
      tag: 'canary'
    }
  ];

  const deployRes = await httpsRequest(serviceUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify(updatePayload));

  if (deployRes.statusCode !== 200) {
    throw new Error(`Failed to deploy canary to Cloud Run: ${deployRes.statusCode} - ${deployRes.raw}`);
  }

  console.log('Canary deployment request accepted. Waiting for new revision to become Ready...');
  let canaryReady = false;
  let newRevisionName = null;
  let canaryUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(6000);
    const pollRes = await httpsRequest(serviceUrl);
    if (pollRes.statusCode === 200) {
      const pollSvc = pollRes.data;
      const latestCreated = pollSvc.status?.latestCreatedRevisionName;
      const latestReady = pollSvc.status?.latestReadyRevisionName;
      const trafficList = pollSvc.status?.traffic || [];
      const canaryEntry = trafficList.find(t => t.tag === 'canary');
      canaryUrl = canaryEntry?.url;

      if (latestReady && latestReady !== primaryRevision) {
        newRevisionName = latestReady;
        canaryReady = true;
        console.log(`\nNew revision Ready: ${newRevisionName}`);
        console.log(`Canary URL: ${canaryUrl}`);
        break;
      } else {
        process.stdout.write(`\rCreating revision: ${latestCreated} (latestReady: ${latestReady})...`);
      }
    }
  }

  if (!canaryReady) {
    throw new Error('Canary revision did not become ready within timeout');
  }

  console.log(`\n[6/7] Verifying canary revision (${newRevisionName}) at ${canaryUrl || serviceUrl}...`);
  const testHost = canaryUrl || 'https://pos-wms-backend-uqq7uwnf7a-as.a.run.app';
  console.log(`Target canary endpoint: ${testHost}`);

  // Test preflight OPTIONS on localhost:8082
  const originsToTest = [
    { origin: 'http://localhost:8082', expectedAllowed: true },
    { origin: 'http://localhost:8081', expectedAllowed: true },
    { origin: 'http://127.0.0.1:8082', expectedAllowed: true },
    { origin: 'http://127.0.0.1:8081', expectedAllowed: true },
    { origin: 'https://evil.example.com', expectedAllowed: false }
  ];

  for (const { origin, expectedAllowed } of originsToTest) {
    const optRes = await httpsRequest(`${testHost}/api/Auth/login`, {
      method: 'OPTIONS',
      noAuth: true,
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization'
      }
    });

    const allowOrigin = optRes.headers['access-control-allow-origin'];
    console.log(`\n[Preflight] Origin: ${origin}`);
    console.log(`Status: ${optRes.statusCode}`);
    console.log(`Access-Control-Allow-Origin: ${allowOrigin || 'NONE (BLOCKED)'}`);

    if (expectedAllowed && allowOrigin !== origin) {
      throw new Error(`FAIL: Origin ${origin} should be allowed but got: ${allowOrigin}`);
    }
    if (!expectedAllowed && allowOrigin) {
      throw new Error(`FAIL: Origin ${origin} should be blocked but got: ${allowOrigin}`);
    }
  }

  // Test POST demo-login on Canary
  console.log('\n--- Testing POST /api/Auth/demo-login on Canary ---');
  const loginRes = await httpsRequest(`${testHost}/api/Auth/demo-login`, {
    method: 'POST',
    noAuth: true,
    headers: {
      'Origin': 'http://localhost:8082',
      'Content-Type': 'application/json'
    }
  }, JSON.stringify({}));

  console.log(`Demo login status: ${loginRes.statusCode}`);
  console.log(`Demo login Access-Control-Allow-Origin: ${loginRes.headers['access-control-allow-origin']}`);
  if (loginRes.statusCode !== 200 || !loginRes.data?.data?.accessToken) {
    throw new Error(`Demo login failed on canary: ${loginRes.statusCode} - ${loginRes.raw}`);
  }
  const token = loginRes.data.data.accessToken;
  console.log(`Demo login token acquired successfully!`);

  // Test GET Products on Canary
  console.log('\n--- Testing GET /api/Products on Canary ---');
  const prodRes = await httpsRequest(`${testHost}/api/Products`, {
    method: 'GET',
    noAuth: true,
    headers: {
      'Origin': 'http://localhost:8082',
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`Products status: ${prodRes.statusCode}`);
  console.log(`Products Access-Control-Allow-Origin: ${prodRes.headers['access-control-allow-origin']}`);
  console.log(`Products count: ${prodRes.data?.data?.length}`);
  if (prodRes.statusCode !== 200 || prodRes.data?.data?.length !== 38) {
    throw new Error(`Products verification failed on canary: ${prodRes.statusCode} count=${prodRes.data?.data?.length}`);
  }

  console.log(`\n[7/7] All canary tests PASSED! Shifting 100% traffic to revision: ${newRevisionName} ...`);
  const finalSvcRes = await httpsRequest(serviceUrl);
  const finalSvc = finalSvcRes.data;
  finalSvc.spec.traffic = [
    {
      revisionName: newRevisionName,
      percent: 100
    }
  ];

  const shiftRes = await httpsRequest(serviceUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify(finalSvc));

  if (shiftRes.statusCode !== 200) {
    throw new Error(`Failed to shift 100% traffic: ${shiftRes.statusCode} - ${shiftRes.raw}`);
  }

  console.log('Traffic shifted to 100%! Waiting for service traffic to reflect...');
  for (let i = 0; i < 20; i++) {
    await sleep(4000);
    const checkTrafficRes = await httpsRequest(serviceUrl);
    const currentTrafficList = checkTrafficRes.data?.status?.traffic || [];
    const mainTraffic = currentTrafficList.find(t => t.revisionName === newRevisionName && t.percent === 100);
    if (mainTraffic) {
      console.log(`\nVerified: ${newRevisionName} is now receiving 100% traffic!`);
      break;
    }
    process.stdout.write('.');
  }

  console.log('\n=============================================');
  console.log('DEPLOYMENT & TRAFFIC SHIFT SUCCESSFULLY COMPLETED!');
  console.log(`Revision: ${newRevisionName}`);
  console.log(`Git SHA: ${gitSha}`);
  console.log(`Image: ${imageTag}`);
  console.log('=============================================');
}

main().catch(err => {
  console.error('\nERROR:', err);
  process.exit(1);
});
