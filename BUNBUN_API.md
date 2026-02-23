# BunBun API Gateway Documentation

**Version**: 0.1.0
**Base URL**: `http://localhost:3000` (development) | `https://bunbun.railway.app` (production)

BunBun is a unified internal API gateway that provides external endpoints for interacting with all Railway internal services (Postgres, GoTrue Auth, Storage, Postgres Meta).

---

## Table of Contents

1. [Authentication](#authentication)
2. [Database Operations](#database-operations)
3. [Auth Operations](#auth-operations)
4. [Storage Operations](#storage-operations)
5. [Health Checks](#health-checks)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)

---

## Authentication

### Authentication Types

**User JWT Token**:
- Standard user authentication
- Required for: auth operations, storage operations, user-specific data
- Format: `Authorization: Bearer <user_jwt_token>`

**Service Role Token**:
- Admin/system-level authentication
- Required for: database operations, admin auth operations
- Format: `Authorization: Bearer <service_role_key>`
- Value: `SUPABASE_SERVICE_KEY` from environment

### Getting a User Token

```bash
# Sign in to get a user token
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

Response includes `access_token` which is your user JWT.

---

## Database Operations

**Base Path**: `/api/db/*`
**Auth Required**: Service Role Token

### POST /api/db/query

Execute a raw SQL query.

**Request**:
```json
{
  "sql": "SELECT * FROM users WHERE id = $1",
  "params": [123]
}
```

**Response**:
```json
{
  "rows": [...],
  "rowCount": 1,
  "latency": 5
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/db/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service_role_key>" \
  -d '{"sql": "SELECT 1 as test"}'
```

### POST /api/db/migrate

Run a database migration.

**Request**:
```json
{
  "name": "add_users_table",
  "sql": "CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL);"
}
```

**Response**:
```json
{
  "success": true,
  "name": "add_users_table",
  "executedAt": "2025-11-25T10:00:00.000Z"
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/db/migrate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service_role_key>" \
  -d '{
    "name": "add_users_table",
    "sql": "CREATE TABLE users (id SERIAL PRIMARY KEY);"
  }'
```

### GET /api/db/tables

List all tables in specified schemas.

**Query Parameters**:
- `schemas` (optional): Comma-separated list of schema names (default: `public`)

**Response**:
```json
{
  "tables": [
    {
      "schema": "public",
      "name": "users",
      "size": "64 kB"
    }
  ]
}
```

**Example**:
```bash
curl http://localhost:3000/api/db/tables?schemas=public,auth \
  -H "Authorization: Bearer <service_role_key>"
```

### GET /api/db/health

Check database connection health.

**Response**:
```json
{
  "connected": true,
  "latency": 3
}
```

**Example**:
```bash
curl http://localhost:3000/api/db/health
```

---

## Auth Operations

**Base Path**: `/api/auth/*`
**Auth Required**: Varies by endpoint

### POST /api/auth/signup

Create a new user account.

**Auth Required**: None

**Request**:
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "metadata": {
    "name": "John Doe"
  }
}
```

**Response**:
```json
{
  "user": {
    "id": "...",
    "email": "user@example.com"
  },
  "session": {
    "access_token": "...",
    "refresh_token": "..."
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure_password"
  }'
```

### POST /api/auth/signin

Sign in with email and password.

**Auth Required**: None

**Request**:
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response**:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "...",
    "email": "user@example.com"
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure_password"
  }'
```

### POST /api/auth/signout

Sign out and revoke token.

**Auth Required**: User JWT Token

**Response**:
```json
{
  "success": true
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/auth/signout \
  -H "Authorization: Bearer <user_token>"
```

### GET /api/auth/user

Get current user from token.

**Auth Required**: User JWT Token

**Response**:
```json
{
  "id": "...",
  "email": "user@example.com",
  "user_metadata": {...},
  "created_at": "..."
}
```

**Example**:
```bash
curl http://localhost:3000/api/auth/user \
  -H "Authorization: Bearer <user_token>"
```

### GET /api/auth/admin/users

Admin: List all users.

**Auth Required**: Service Role Token

**Query Parameters**:
- `page` (optional): Page number
- `perPage` (optional): Results per page

**Response**:
```json
{
  "users": [
    {
      "id": "...",
      "email": "user@example.com",
      "created_at": "..."
    }
  ]
}
```

**Example**:
```bash
curl http://localhost:3000/api/auth/admin/users?page=1&perPage=10 \
  -H "Authorization: Bearer <service_role_key>"
```

### POST /api/auth/admin/users

Admin: Create a new user.

**Auth Required**: Service Role Token

**Request**:
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "email_confirm": true,
  "user_metadata": {
    "name": "John Doe"
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:3000/api/auth/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service_role_key>" \
  -d '{
    "email": "admin-created@example.com",
    "password": "secure_password",
    "email_confirm": true
  }'
```

### DELETE /api/auth/admin/users/:id

Admin: Delete a user.

**Auth Required**: Service Role Token

**Response**:
```json
{
  "success": true
}
```

**Example**:
```bash
curl -X DELETE http://localhost:3000/api/auth/admin/users/<user_id> \
  -H "Authorization: Bearer <service_role_key>"
```

---

## Storage Operations

**Base Path**: `/api/storage/*`
**Auth Required**: User JWT Token

### POST /api/storage/upload/:bucket/*

Upload a file to storage.

**Request**: Multipart form data
- `file`: File to upload

**Example**:
```bash
curl -X POST http://localhost:3000/api/storage/upload/avatars/user123.png \
  -H "Authorization: Bearer <user_token>" \
  -F "file=@/path/to/image.png"
```

**Response**:
```json
{
  "Key": "avatars/user123.png",
  "url": "..."
}
```

### GET /api/storage/download/:bucket/*

Download a file from storage.

**Example**:
```bash
curl http://localhost:3000/api/storage/download/avatars/user123.png \
  -H "Authorization: Bearer <user_token>" \
  -o downloaded-file.png
```

Returns the file as a binary stream.

### DELETE /api/storage/delete/:bucket/*

Delete a file from storage.

**Example**:
```bash
curl -X DELETE http://localhost:3000/api/storage/delete/avatars/user123.png \
  -H "Authorization: Bearer <user_token>"
```

**Response**:
```json
{
  "success": true
}
```

### GET /api/storage/list/:bucket

List files in a bucket.

**Query Parameters**:
- `prefix` (optional): Filter by path prefix
- `limit` (optional): Max results
- `offset` (optional): Pagination offset

**Example**:
```bash
curl http://localhost:3000/api/storage/list/avatars?prefix=user123/ \
  -H "Authorization: Bearer <user_token>"
```

**Response**:
```json
[
  {
    "name": "user123/profile.png",
    "id": "...",
    "updated_at": "...",
    "created_at": "...",
    "last_accessed_at": "...",
    "metadata": {...}
  }
]
```

### GET /api/storage/buckets

List all storage buckets.

**Auth Required**: User JWT Token (admin)

**Example**:
```bash
curl http://localhost:3000/api/storage/buckets \
  -H "Authorization: Bearer <user_token>"
```

**Response**:
```json
[
  {
    "id": "avatars",
    "name": "avatars",
    "public": true,
    "created_at": "..."
  }
]
```

---

## Health Checks

### GET /health

Overall service health check.

**Auth Required**: None

**Response**:
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "version": "0.1.0",
  "timestamp": "2025-11-25T10:00:00.000Z"
}
```

**Example**:
```bash
curl http://localhost:3000/health
```

### GET /api/health/services

Check health of all connected internal services.

**Auth Required**: None

**Response**:
```json
{
  "status": "ok",
  "services": {
    "postgres": {
      "status": "up",
      "latency": 3
    },
    "auth": {
      "status": "up",
      "latency": 12
    },
    "storage": {
      "status": "up",
      "latency": 8
    },
    "meta": {
      "status": "up",
      "latency": 5
    }
  },
  "timestamp": "2025-11-25T10:00:00.000Z"
}
```

**Example**:
```bash
curl http://localhost:3000/api/health/services
```

---

## Error Handling

All errors return JSON with a consistent format:

```json
{
  "error": "Error message here"
}
```

### HTTP Status Codes

- `200 OK`: Success
- `400 Bad Request`: Invalid request body or parameters
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service health check failed

---

## Rate Limiting

All endpoints are rate-limited per IP address:

| Endpoint Category | Limit |
|------------------|-------|
| Health checks | 100 requests/minute |
| Database queries | 20 requests/minute |
| Database migrations | 10 requests/minute |
| Database tables list | 50 requests/minute |
| Auth signup | 10 requests/minute |
| Auth signin | 20 requests/minute |
| Auth signout | 50 requests/minute |
| Auth user info | 100 requests/minute |
| Auth admin operations | 20-50 requests/minute |
| Storage upload | 50 requests/minute |
| Storage download | 100 requests/minute |
| Storage delete | 50 requests/minute |
| Storage list | 100 requests/minute |

When rate limit is exceeded, the API returns:

```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

HTTP Status: `429 Too Many Requests`

---

## Environment Variables

Required environment variables for BunBun:

```bash
# Server
PORT=3000
NODE_ENV=production

# Security
JWT_SECRET=<your_jwt_secret_32_chars_min>
SUPABASE_SERVICE_KEY=<your_service_role_key>

# Database
DATABASE_URL=postgres://postgres:<password>@postgres.railway.internal:5432/postgres

# Internal Services (Railway)
AUTH_URL=http://supabase-auth.railway.internal:9999
STORAGE_URL=http://supabase-storage.railway.internal:5000
META_URL=http://postgres-meta.railway.internal:8080
KONG_URL=http://kong.railway.internal:8000
POSTGREST_URL=http://postgrest.railway.internal:3000
REALTIME_URL=http://supabase-realtime.railway.internal:4000
FUNCTIONS_URL=http://edge-functions.railway.internal:9000

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://studio.ogel.com
```

---

## Development

### Running Locally

```bash
cd apps/security/packages/server
bun install
bun run dev
```

### Running Tests

```bash
bun test
```

### Deployment

BunBun is deployed on Railway and connects to internal Railway services via the private network (`*.railway.internal`).

---

## Support

For issues or questions, contact the platform team or check the project documentation in `.SoT/`.

---

**Last Updated**: 2025-11-25
**Maintained By**: Josh Tanaka (Full-Stack AI Engineer)
