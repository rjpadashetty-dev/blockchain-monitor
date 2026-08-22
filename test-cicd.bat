@echo off
setlocal enabledelayedexpansion

echo Getting token...
for /f "delims=" %%A in ('curl -s -X POST "http://localhost:5000/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"password\"}"') do set "LOGIN_JSON=%%A"

for /f "tokens=2 delims=:," %%A in ("%LOGIN_JSON%") do set "TOKEN=%%~A"

echo Token: %TOKEN%

echo Posting pipeline status...
curl -s -X POST "http://localhost:5000/api/admin/pipeline-status" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"workflow\":\"CI/CD Pipeline\",\"status\":\"passed\",\"commit\":\"abc123\",\"branch\":\"main\",\"buildNumber\":1,\"author\":\"test\"}"

echo.
echo Done.
