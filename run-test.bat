@echo off
REM Test API endpoints
cd /d c:\Users\Vaishnavi Padashetty\Desktop\BlockChain

echo ============================================================
echo Step 1: Getting authentication token...
echo ============================================================

REM Use Node.js to handle the API calls since curl is simple
node test-api.js

pause
