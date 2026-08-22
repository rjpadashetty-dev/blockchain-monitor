const BASE_URL = 'http://localhost:5000';

const pipelines = [
  { workflow: 'Backend API', status: 'passed', commit: 'backend-local', branch: 'main', buildNumber: 101, author: 'local-test' },
  { workflow: 'Frontend UI', status: 'passed', commit: 'frontend-local', branch: 'main', buildNumber: 102, author: 'local-test' },
  { workflow: 'ML Anomaly Detector', status: 'passed', commit: 'ml-local', branch: 'feature/anomaly-v2', buildNumber: 103, author: 'local-test' },
  { workflow: 'Security Tests', status: 'failed', commit: 'security-local', branch: 'main', buildNumber: 104, author: 'local-test' }
];

async function main() {
  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password' })
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`);
  }

  const { token } = await loginResponse.json();

  for (const pipeline of pipelines) {
    const response = await fetch(`${BASE_URL}/api/admin/pipeline-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...pipeline,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`${pipeline.workflow} failed: ${response.status} ${await response.text()}`);
    }

    console.log(`Recorded: ${pipeline.workflow} (${pipeline.status})`);
  }

  const historyResponse = await fetch(`${BASE_URL}/api/admin/pipeline-status`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const history = await historyResponse.json();

  console.log('\nLive totals:');
  console.log(history.stats);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
