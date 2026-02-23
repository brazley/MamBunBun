# @security/server

**Zero-Knowledge Encrypted Backup (ZKEB) Server**

PostgreSQL backend for secure backup storage where **the server cannot decrypt user data**.

---

## Features

- 🔐 **Zero-Knowledge Architecture**: Server stores encrypted data it cannot decrypt
- 🗄️ **PostgreSQL + Prisma**: Type-safe database access with migrations
- 🔒 **Row-Level Security**: Multi-tenant isolation at database level
- 📝 **Audit Logs**: Compliance-ready activity tracking (SOC 2, HIPAA)
- 🎯 **Type Safety**: Full TypeScript support with Prisma Client
- 🧪 **Development Seeds**: Pre-populated test data for local development

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Database URL

Create `.env` file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/zkeb"
```

### 3. Run Migrations

```bash
# Generate Prisma client
npm run db:generate

# Create database schema
npm run db:migrate

# Seed development data
npm run db:seed
```

### 4. Verify Setup

```bash
# Open Prisma Studio (database GUI)
npm run db:studio
```

Navigate to `http://localhost:5555` to explore the database.

---

## Database Schema

```
Users (emailHash, passwordHash)
  ├── Devices (deviceName, publicKey)
  │     └── Backups (ciphertext, nonce, authTag, signature)
  └── AuditLogs (action, timestamp, metadata)
```

**Full documentation**: See [DATABASE.md](./DATABASE.md)

---

## Zero-Knowledge Guarantees

### What the Server CANNOT Do

- ❌ Decrypt user backups (lacks encryption keys)
- ❌ Identify users without knowing their email (SHA-256 hashing)
- ❌ Forge device signatures (lacks private keys)
- ❌ Access data from other users (RLS isolation)

### What the Server CAN Do

- ✅ Store encrypted ciphertext (opaque bytes)
- ✅ Verify user authentication (hashed credentials)
- ✅ Validate backup signatures (using device public keys)
- ✅ Track metadata (sizes, timestamps, classifications)

---

## Scripts

```bash
# Development
npm run dev              # Start server with hot reload
npm run build            # Build TypeScript to dist/
npm run start            # Run production build

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Prototype schema changes
npm run db:migrate       # Create migration
npm run db:migrate:deploy  # Deploy migrations (production)
npm run db:seed          # Populate development data
npm run db:studio        # Open database GUI
npm run db:reset         # Reset database (WARNING: Deletes all data)

# Testing
npm run test             # Run tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report

# Quality
npm run lint             # Lint code
npm run typecheck        # TypeScript type checking
```

---

## Usage Examples

### Creating a User

```typescript
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// Hash email (zero-knowledge lookup)
const emailHash = createHash('sha256')
  .update('user@example.com'.toLowerCase())
  .digest('hex');

// Create user with hashed credentials
const user = await prisma.user.create({
  data: {
    emailHash,
    passwordHash: await pbkdf2Hash('password', 600_000),
  },
});
```

### Storing an Encrypted Backup

```typescript
// Client encrypts data before upload
const bek = await deriveBackupKey(umk, dmk);
const { ciphertext, nonce, authTag } = await encrypt(bek, backupData);
const signature = await sign(devicePrivateKey, ciphertext);

// Server stores opaque encrypted data
const backup = await prisma.backup.create({
  data: {
    userId: user.id,
    deviceId: device.id,
    ciphertext,
    nonce,
    authTag,
    sizeBytes: ciphertext.length,
    dataClassification: 'Confidential',
    signature,
  },
});

// Server CANNOT decrypt - lacks encryption keys
```

### Querying User's Backups

```typescript
// With RLS enabled, automatically filters by user
await prisma.$executeRaw`SET app.current_user_id = ${userId}`;

const backups = await prisma.backup.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  take: 20,
  include: {
    device: true,
  },
});
```

### Audit Logging

```typescript
await prisma.auditLog.create({
  data: {
    userId: user.id,
    action: 'backup_created',
    ipAddress: hashIP(request.ip),
    userAgent: request.headers['user-agent'],
    metadata: {
      sizeBytes: backup.sizeBytes,
      dataClassification: backup.dataClassification,
      // ❌ NEVER log sensitive data
    },
  },
});
```

---

## Row-Level Security (RLS)

Multi-tenant isolation enforced at the database level:

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY user_isolation ON users
  FOR ALL
  USING (id = current_setting('app.current_user_id')::uuid);
```

**Set user context in application:**

```typescript
// After authentication
await prisma.$executeRaw`SET app.current_user_id = ${userId}`;

// All queries now automatically filtered
const myBackups = await prisma.backup.findMany();  // Only user's backups
```

---

## Development Seeds

The database comes pre-populated with test data:

```typescript
// Test Users
alice@example.com  →  AliceTestPassword123!
bob@example.com    →  BobTestPassword456!

// Test Devices
- Alice's iPhone 15 Pro
- Alice's MacBook Pro
- Bob's Pixel 8 Pro

// Test Backups
- 8 encrypted backups (various sizes and classifications)

// Test Audit Logs
- User creation, device addition, backup events
```

**Reseed database:**

```bash
npm run db:reset  # Deletes all data and re-seeds
```

---

## Security Considerations

### Key Derivation (Client-Side Only)

```
Password (user input)
  ↓ PBKDF2 (600k iterations)
User Master Key (UMK)
  ↓ HKDF
Device Master Key (DMK)
  ↓ HKDF
Backup Encryption Key (BEK) ──→ Encrypt backup
```

**CRITICAL**: All keys derived on client. Server NEVER sees keys.

### Data Classification

- **Internal**: Low sensitivity (e.g., app preferences)
- **Confidential**: Medium sensitivity (e.g., notes, contacts)
- **Restricted**: High sensitivity (e.g., health data, financials)

Used for compliance reporting, NOT access control (all data encrypted equally).

### Compliance Features

- ✅ **SOC 2**: Audit logs with tamper-evident timestamps
- ✅ **HIPAA**: Encrypted PHI storage (server cannot decrypt)
- ✅ **GDPR**: Right to erasure (ON DELETE CASCADE policies)
- ✅ **ISO 27001**: Access control (RLS), encryption at rest

---

## Production Deployment

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@host:5432/zkeb"
NODE_ENV="production"
```

### Deploy Steps

```bash
# 1. Build application
npm run build

# 2. Generate Prisma client
npm run db:generate

# 3. Deploy migrations (no prompts)
npm run db:migrate:deploy

# 4. Start server
npm run start
```

### Database Backup Strategy

```bash
# Daily encrypted backups
pg_dump $DATABASE_URL | gpg --encrypt > backup-$(date +%Y%m%d).sql.gpg

# Backup RLS policies
pg_dump -t pg_policies $DATABASE_URL > rls-policies-backup.sql
```

### Monitoring Queries

```sql
-- Check RLS is active
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public';

-- Monitor backup growth
SELECT
  date_trunc('day', created_at) as day,
  count(*) as backup_count,
  sum(size_bytes) / 1024 / 1024 as total_mb
FROM backups
GROUP BY day
ORDER BY day DESC;

-- Audit log activity
SELECT action, count(*)
FROM audit_logs
WHERE timestamp > now() - interval '24 hours'
GROUP BY action;
```

---

## Troubleshooting

### Migration Errors

```bash
# Reset migrations (development only)
npm run db:reset

# Force schema sync (bypass migrations)
npm run db:push
```

### Connection Issues

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1"

# Check Prisma connection
npx prisma db pull
```

### Performance Issues

```sql
-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100
ORDER BY n_distinct DESC;

-- Slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Architecture Decisions

### Why PostgreSQL?

- **ACID compliance**: Data integrity guarantees
- **RLS support**: Built-in multi-tenant isolation
- **JSONB**: Flexible metadata storage
- **Mature tooling**: Proven backup/replication
- **Supabase integration**: First-class support

### Why Prisma?

- **Type safety**: Full TypeScript support
- **Migration system**: Version-controlled schema changes
- **Developer experience**: Great documentation and tooling
- **Query optimization**: Automatic N+1 prevention

### Why Zero-Knowledge?

- **Regulatory compliance**: HIPAA, GDPR requirements
- **User trust**: Server compromise doesn't leak data
- **Security defense**: Multiple layers of protection
- **Ethical design**: Minimize data collection

---

## Related Packages

- **[@security/crypto](../crypto)**: HKDF key derivation + AES-256-GCM encryption
- **[@security/ogelfy](../ogelfy)**: iOS client app (SwiftUI + SwiftData)

---

## References

- **Prisma Docs**: https://www.prisma.io/docs
- **PostgreSQL RLS**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **NIST SP 800-38D**: AES-GCM specification
- **RFC 5869**: HKDF key derivation
- **OWASP**: Password storage guidelines

---

## BunBun API Gateway

**Version**: 0.1.0 (NEW)

BunBun is a unified internal API gateway that provides external endpoints for all Railway internal services (Postgres, GoTrue Auth, Storage, Postgres Meta).

### Quick Start

```bash
# Development
bun run dev

# Production
bun run start
```

### API Documentation

See [BUNBUN_API.md](./BUNBUN_API.md) for complete API reference.

### Key Features

- 🔐 **Unified Authentication**: Service role and user JWT support
- 🗄️ **Database Operations**: Execute queries and migrations via API
- 👤 **Auth Proxy**: GoTrue authentication endpoints
- 📁 **Storage Proxy**: File upload/download via API
- 💊 **Health Checks**: Monitor all internal services
- 🚦 **Rate Limiting**: Protect against abuse
- 🔒 **Type-Safe**: Full TypeScript with Zod validation

### Architecture

```
External API (BunBun)
    ↓
Railway Private Network
    ├── Postgres (5432)
    ├── Auth (9999)
    ├── Storage (5000)
    └── Meta (8080)
```

### Status

✅ Implementation complete
⏳ Deployment pending
⏳ Integration tests pending

See [BUNBUN_API_GATEWAY_COMPLETE.md](./.SoT/status-reports/BUNBUN_API_GATEWAY_COMPLETE.md) for full status.

---

## License

MIT License - See [LICENSE](./LICENSE) for details.
