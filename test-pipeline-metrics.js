// Test script to verify CI/CD pipeline metrics endpoint
const BASE_URL = 'http://localhost:5000';

async function testPipelineMetrics() {
  try {
    console.log('🔐 Step 1: Login as admin...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' })
    });
    
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ Login successful!');
    console.log(`Token: ${token.substring(0, 20)}...`);
    
    console.log('\n📊 Step 2: Send pipeline metrics...');
    const metricsRes = await fetch(`${BASE_URL}/api/admin/pipeline-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        workflow: 'CI/CD Pipeline',
        status: 'passed',
        commit: 'abc123def456',
        branch: 'main',
        timestamp: new Date().toISOString(),
        buildNumber: 1,
        author: 'test-user'
      })
    });
    
    if (!metricsRes.ok) throw new Error(`Metrics POST failed: ${metricsRes.status}`);
    
    const metricsData = await metricsRes.json();
    console.log('✅ Pipeline metrics sent successfully!');
    console.log('Response:', metricsData);
    
    console.log('\n📈 Step 3: Retrieve pipeline history...');
    const historyRes = await fetch(`${BASE_URL}/api/admin/pipeline-status`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!historyRes.ok) throw new Error(`History GET failed: ${historyRes.status}`);
    
    const historyData = await historyRes.json();
    console.log('✅ Pipeline history retrieved!');
    console.log('Statistics:', historyData.stats);
    console.log('Recent builds count:', historyData.recentBuilds?.length || 0);
    
    console.log('\n📊 Step 4: Get detailed pipeline statistics...');
    const statsRes = await fetch(`${BASE_URL}/api/admin/pipeline-stats`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!statsRes.ok) throw new Error(`Stats GET failed: ${statsRes.status}`);
    
    const statsData = await statsRes.json();
    console.log('✅ Pipeline statistics retrieved!');
    console.log('Total pipelines:', statsData.totalPipelines);
    console.log('Passed:', statsData.totalPassed);
    console.log('Failed:', statsData.totalFailed);
    
    console.log('\n✨ All tests passed! CI/CD metrics system is working correctly!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testPipelineMetrics();
