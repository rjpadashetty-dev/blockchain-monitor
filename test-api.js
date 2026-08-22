const http = require('http');

function makeRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  console.log('='.repeat(60));
  console.log('Step 1: Authenticating...');
  console.log('='.repeat(60));

  const loginResponse = await makeRequest('POST', '/api/auth/login', {
    username: 'admin',
    password: 'password'
  });

  const token = loginResponse.token;
  console.log(`✅ Token: ${token.substring(0, 30)}...\n`);

  console.log('='.repeat(60));
  console.log('Step 2: Sending test pipeline data...');
  console.log('='.repeat(60));

  const testResponse = await makeRequest('POST', '/api/admin/pipeline-status', {
    workflow: 'CI/CD Pipeline',
    status: 'passed',
    commit: 'abc123',
    branch: 'main',
    buildNumber: 1,
    author: 'test'
  }, token);

  console.log('Response:', JSON.stringify(testResponse, null, 2), '\n');

  console.log('='.repeat(60));
  console.log('Step 3: Fetching pipeline stats...');
  console.log('='.repeat(60));

  const statsResponse = await makeRequest('GET', '/api/admin/pipeline-status?limit=50', null, token);

  console.log(`Total Pipelines: ${statsResponse.stats.totalPipelines}`);
  console.log(`Passed: ${statsResponse.stats.passedPipelines}`);
  console.log(`Failed: ${statsResponse.stats.failedPipelines}`);
  console.log(`Success Rate: ${statsResponse.stats.successRate}\n`);

  console.log('='.repeat(60));
  console.log('✅ TEST COMPLETED!');
  console.log('Now refresh your admin dashboard at http://localhost:3000');
  console.log('='.repeat(60));
}

test().catch(console.error);
