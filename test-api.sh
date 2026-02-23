#!/bin/bash

# ZKEB API Server Test Script
# Tests all endpoints and middleware functionality

set -e

API_URL="http://localhost:3000"
JWT_SECRET="test-secret-key-for-development-minimum-32-characters-long"

echo "========================================"
echo "ZKEB API Server Test Suite"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function test_endpoint() {
    local name="$1"
    local expected_status="$2"
    local actual_status="$3"
    local response="$4"

    if [ "$actual_status" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} $name: Status $actual_status (Expected $expected_status)"
        if [ ! -z "$response" ]; then
            echo "  Response: $response"
        fi
    else
        echo -e "${RED}✗${NC} $name: Status $actual_status (Expected $expected_status)"
        if [ ! -z "$response" ]; then
            echo "  Response: $response"
        fi
        exit 1
    fi
    echo ""
}

# Test 1: Health Check
echo "Test 1: Health Check Endpoint"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/health")
STATUS=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')
test_endpoint "Health Check" 200 "$STATUS" "$BODY"

# Test 2: Protected Endpoint - No Auth
echo "Test 2: Protected Endpoint - No Authorization Header"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/backups")
STATUS=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')
test_endpoint "No Auth Header" 401 "$STATUS" "$BODY"

# Test 3: Protected Endpoint - Invalid Token
echo "Test 3: Protected Endpoint - Invalid Token"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer invalid-token" "$API_URL/api/backups")
STATUS=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')
test_endpoint "Invalid Token" 401 "$STATUS" "$BODY"

# Test 4: Protected Endpoint - Valid Token
echo "Test 4: Protected Endpoint - Valid JWT Token"
# Generate valid token using Node
TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 'test-user-123', deviceId: 'device-456' },
  '$JWT_SECRET',
  { expiresIn: '24h' }
);
console.log(token);
")

RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_URL/api/backups")
STATUS=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')
test_endpoint "Valid Token" 200 "$STATUS" "$BODY"

# Test 5: 404 Not Found
echo "Test 5: Non-existent Endpoint"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/non-existent")
STATUS=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')
test_endpoint "404 Not Found" 404 "$STATUS" "$BODY"

echo "========================================"
echo -e "${GREEN}All Tests Passed!${NC}"
echo "========================================"
echo ""
echo "API Server is working correctly:"
echo "  ✓ Health check responding"
echo "  ✓ Authentication working (JWT)"
echo "  ✓ Proper HTTP status codes"
echo "  ✓ Protected endpoints secured"
echo "  ✓ 404 handling working"
echo ""
echo "Next steps:"
echo "  - Add more API endpoints"
echo "  - Test rate limiting (requires multiple IPs)"
echo "  - Deploy to Railway"
echo "  - Add OpenAPI docs"
