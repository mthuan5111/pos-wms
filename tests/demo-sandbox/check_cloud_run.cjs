const { execSync } = require('child_process');
const https = require('https');

function getAccessToken() {
  const out = execSync('cmd.exe /c gcloud auth print-access-token', { encoding: 'utf8' });
  return out.trim();
}

async function request(url, options = {}) {
  const token = getAccessToken();
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function main() {
  console.log('Fetching Cloud Run Service details...');
  const res = await request('https://asia-southeast1-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/project-d7df6a92-6e2f-434b-802/services/pos-wms-backend');
  console.log('HTTP Status:', res.status);
  if (res.status === 200) {
    const svc = res.data;
    console.log('Service Name:', svc.metadata?.name);
    console.log('URL:', svc.status?.url);
    console.log('Latest Created Revision:', svc.status?.latestCreatedRevisionName);
    console.log('Latest Ready Revision:', svc.status?.latestReadyRevisionName);
    console.log('Traffic Configuration:', JSON.stringify(svc.status?.traffic, null, 2));
    const container = svc.spec?.template?.spec?.containers?.[0];
    console.log('Current Image:', container?.image);
    console.log('Container Env:', JSON.stringify(container?.env?.map(e => e.name), null, 2));
  } else {
    console.error('Error fetching service:', res.data || res.raw);
  }
}

main().catch(console.error);
