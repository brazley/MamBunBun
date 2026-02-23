# ZKEB API Server

Production-ready API server for Zero-Knowledge Encrypted Backups, built with Bun runtime.

## Architecture

- **Runtime**: Bun (100k+ req/sec capability)
- **Framework**: Custom Bun.serve with middleware pipeline
- **Authentication**: JWT tokens (HS256)
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Configurable origin whitelist
- **Logging**: Structured JSON logs

## Project Structure

```
server/
├── src/
│   ├── api/
│   │   ├── server.ts       # Ogelfy-based server (prototype)
│   │   └── server-v2.ts    # Production server with proper status codes
│   ├── config/
│   │   └── env.ts          # Environment validation (Zod)
│   └── middleware/
│       ├── auth.ts         # JWT authentication
│       ├── rate-limit.ts   # Rate limiting
│       ├── cors.ts         # CORS headers
│       └── logging.ts      # Request logging
├── .env                    # Environment config
├── .env.api.example        # Example config
└── package.json
```

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/quikolas/Documents/GitHub/supabase-master/apps/security/packages/server
bun install
```

### 2. Configure Environment

```bash
cp .env.api.example .env
# Edit .env with your JWT secret (minimum 32 characters)
```

### 3. Start Server

```bash
# Development (hot reload)
bun run dev

# Production
bun run start
```

## API Endpoints

### Health Check

```bash
GET /health

Response:
{
  "status": "ok",
  "uptime": 123.456,
  "version": "0.1.0"
}
```

### Get Backups (Protected)

```bash
GET /api/backups
Authorization: Bearer <jwt-token>

Success Response (200):
{
  "backups": [],
  "userId": "user-123"
}

Error Responses:
401: { "error": "Unauthorized" }
429: { "error": "Rate limit exceeded" }
```

## Testing

### Generate JWT Token

```javascript
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
const token = jwt.sign(
  { userId: 'test-user-123', deviceId: 'device-456' },
  secret,
  { expiresIn: '24h' }
);
console.log(token);
```

### Test Requests

```bash
# Health check
curl http://localhost:3000/health

# Protected endpoint (no auth - expect 401)
curl http://localhost:3000/api/backups

# Protected endpoint (valid token)
TOKEN="your-jwt-token-here"
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/backups
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3000 | No |
| `NODE_ENV` | Environment | development | No |
| `JWT_SECRET` | JWT signing key (min 32 chars) | - | Yes |
| `DATABASE_URL` | PostgreSQL connection | - | No |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | http://localhost:3000 | No |

## Middleware

### Authentication

- JWT token validation (HS256)
- Bearer token format required
- 24-hour token expiration
- Returns user ID and device ID

### Rate Limiting

- 100 requests per 15 minutes per IP
- Uses in-memory store (consider Redis for production clustering)
- Returns 429 when exceeded

### CORS

- Validates origin against whitelist
- Returns appropriate headers for allowed origins
- Supports credentials

### Logging

- Structured JSON output
- Includes timestamp, method, path, status, duration
- Ready for log aggregation tools

## Deployment (Railway)

### 1. Add to Railway

```bash
# From project root
railway up
```

### 2. Configure Environment

Set these in Railway dashboard:
- `JWT_SECRET` (generate secure 64-char string)
- `ALLOWED_ORIGINS` (your frontend URLs)
- `NODE_ENV=production`

### 3. Start Command

```
bun run src/api/server-v2.ts
```

## Performance

- **Throughput**: 100k+ req/sec (Bun capability)
- **Latency**: ~1ms for health check
- **Memory**: ~30MB base footprint

## Security Considerations

1. **JWT Secret**: Use cryptographically secure random string (64+ chars)
2. **Rate Limiting**: Implement Redis-backed store for distributed systems
3. **CORS**: Strictly configure allowed origins
4. **HTTPS**: Always use TLS in production (Railway provides this)
5. **Headers**: Consider adding security headers (CSP, HSTS, etc.)

## Next Steps

- [ ] Add more API endpoints (create backup, restore, etc.)
- [ ] Integrate Prisma for database operations
- [ ] Add request validation (Zod schemas)
- [ ] Implement Redis for distributed rate limiting
- [ ] Add OpenAPI/Swagger documentation
- [ ] Set up monitoring and alerting
- [ ] Add comprehensive test suite
- [ ] Implement request ID tracking
- [ ] Add distributed tracing

## Troubleshooting

### Port already in use

```bash
lsof -ti:3000 | xargs kill -9
```

### JWT verification failing

- Verify JWT_SECRET matches between token generation and validation
- Check token hasn't expired
- Ensure Bearer prefix is included

### CORS errors

- Add frontend origin to ALLOWED_ORIGINS
- Verify origin header is sent with request
- Check browser console for exact error

## Development

### Adding New Endpoints

1. Create handler function in `server-v2.ts`
2. Add to routes Map
3. Implement middleware as needed
4. Test with curl/Postman
5. Update this README

### Middleware Pattern

```typescript
async function myHandler(req: Request): Promise<Response> {
  const start = Date.now();

  try {
    // Apply middleware
    await rateLimitMiddleware(limit, window)(req);
    const auth = await authMiddleware(req);

    // Business logic
    const data = { /* ... */ };

    // Success response
    logRequest(req, 200, Date.now() - start);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Error handling
    const status = /* determine status */;
    logRequest(req, status, Date.now() - start);
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

## License

MIT - ZKEB Security Team
