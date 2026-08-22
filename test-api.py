#!/usr/bin/env python3
import requests
import json

base_url = "http://localhost:5000"

print("=" * 60)
print("Step 1: Authenticating...")
print("=" * 60)

# Login
login_response = requests.post(
    f"{base_url}/api/auth/login",
    json={"username": "admin", "password": "password"}
)
token = login_response.json().get("token")
print(f"✅ Token: {token[:30]}...\n")

print("=" * 60)
print("Step 2: Sending test pipeline data...")
print("=" * 60)

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Send test data
test_payload = {
    "workflow": "CI/CD Pipeline",
    "status": "passed",
    "commit": "abc123",
    "branch": "main",
    "buildNumber": 1,
    "author": "test"
}

response = requests.post(
    f"{base_url}/api/admin/pipeline-status",
    json=test_payload,
    headers=headers
)
print(f"Response: {json.dumps(response.json(), indent=2)}\n")

print("=" * 60)
print("Step 3: Fetching pipeline stats...")
print("=" * 60)

stats_response = requests.get(
    f"{base_url}/api/admin/pipeline-status?limit=50",
    headers=headers
)
stats_data = stats_response.json()

print(f"Total Pipelines: {stats_data['stats']['totalPipelines']}")
print(f"Passed: {stats_data['stats']['passedPipelines']}")
print(f"Failed: {stats_data['stats']['failedPipelines']}")
print(f"Success Rate: {stats_data['stats']['successRate']}\n")

print("=" * 60)
print("✅ TEST COMPLETED!")
print("Now refresh your admin dashboard at http://localhost:3000")
print("=" * 60)
