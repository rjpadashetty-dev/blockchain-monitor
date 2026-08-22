
# Step 1: Login and get token
Write-Host "Step 1: Getting authentication token..." -ForegroundColor Cyan
$loginResponse = curl -s -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"password"}' | ConvertFrom-Json

$token = $loginResponse.token
Write-Host "Token retrieved: $($token.Substring(0, 20))..." -ForegroundColor Green

# Step 2: Send test pipeline data
Write-Host "`nStep 2: Sending test pipeline data..." -ForegroundColor Cyan
$testData = curl -s -X POST http://localhost:5000/api/admin/pipeline-status `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $token" `
  -d '{"workflow":"CI/CD Pipeline","status":"passed","commit":"abc123","branch":"main","buildNumber":1,"author":"test"}' | ConvertFrom-Json

Write-Host "Response: " -ForegroundColor Green
$testData | ConvertTo-Json | Write-Host

# Step 3: Get pipeline stats
Write-Host "`nStep 3: Fetching pipeline stats..." -ForegroundColor Cyan
$stats = curl -s -X GET "http://localhost:5000/api/admin/pipeline-status?limit=50" `
  -H "Authorization: Bearer $token" | ConvertFrom-Json

Write-Host "Total Pipelines: $($stats.stats.totalPipelines)" -ForegroundColor Green
Write-Host "Passed: $($stats.stats.passedPipelines)" -ForegroundColor Green
Write-Host "Failed: $($stats.stats.failedPipelines)" -ForegroundColor Green
Write-Host "Success Rate: $($stats.stats.successRate)" -ForegroundColor Green

Write-Host "`n✅ Test completed! Refresh your admin dashboard in browser." -ForegroundColor Cyan
