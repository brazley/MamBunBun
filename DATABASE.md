# ZKEB Database Schema Documentation

## Zero-Knowledge Architecture

This database is designed with a **fundamental security principle**: Even with full database access, the server **CANNOT** decrypt user data.

### What the Server CAN Do
- ✅ Store encrypted ciphertext (opaque bytes)
- ✅ Verify user authentication (hashed credentials)
- ✅ Validate backup signatures (using device public keys)
- ✅ Track metadata (sizes, timestamps, data classifications)
- ✅ Enforce access control (RLS policies)

### What the Server CANNOT Do
- ❌ Decrypt user backups (lacks encryption keys)
- ❌ Identify users without knowing their email (SHA-256 hashing)
- ❌ Forge device signatures (lacks private keys)
- ❌ Access data from other users (RLS isolation)

---

## Schema Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      ZKEB Database                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Users                    Devices                           │
│  ┌──────────────┐        ┌──────────────┐                  │
│  │ id           │◄───┬───│ id           │                  │
│  │ emailHash    │    │   │ userId       │                  │
│  │ passwordHash │    │   │ deviceName   │                  │
│  │ createdAt    │    │   │ publicKey    │                  │
│  │ updatedAt    │    │   │ lastSeenAt   │                  │
│  └──────────────┘    │   └──────────────┘                  │
│         △            │          △                           │
│         │            │          │                           │
│         │            │          │                           │
│  ┌──────┴────────────┴──────────┴───────┐                  │
│  │         Backups (Encrypted)          │                  │
│  │  ┌────────────────────────────────┐  │                  │
│  │  │ id                             │  │                  │
│  │  │ userId                         │  │                  │
│  │  │ deviceId                       │  │                  │
│  │  │ ─────────────────────────────  │  │                  │
│  │  │ ciphertext    (AES-256-GCM)    │  │  ◄─ ENCRYPTED   │
│  │  │ nonce         (96-bit)         │  │                  │
│  │  │ authTag       (128-bit)        │  │                  │
│  │  │ ─────────────────────────────  │  │                  │
│  │  │ sizeBytes                      │  │                  │
│  │  │ dataClassification             │  │                  │
│  │  │ createdAt                      │  │                  │
│  │  │ signature     (RSA-PSS)        │  │  ◄─ SIGNED      │
│  │  └────────────────────────────────┘  │                  │
│  └──────────────────────────────────────┘                  │
│         △                                                   │
│         │                                                   │
│  ┌──────┴────────┐                                         │
│  │  Audit Logs   │                                         │
│  │ ┌───────────┐ │                                         │
│  │ │ id        │ │                                         │
│  │ │ userId    │ │                                         │
│  │ │ action    │ │                                         │
│  │ │ ipAddress │ │                                         │
│  │ │ timestamp │ │                                         │
│  │ │ metadata  │ │                                         │
│  │ └───────────┘ │                                         │
│  └───────────────┘                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Table Details

### 1. Users Table

Stores user accounts with **hashed** credentials.

```prisma
model User {
  id            String   @id @default(uuid())
  emailHash     String   @unique  // SHA-256(email)
  passwordHash  String            // PBKDF2(password, 600k iterations)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

#### Zero-Knowledge Properties
- **Email is hashed**: Server cannot identify users without knowing their email
- **Password is hashed**: Uses PBKDF2 with 600,000 iterations (OWASP 2023)
- **No reversibility**: Cannot recover original email or password from hashes

#### Usage Pattern
```typescript
// Client-side (before sending to server)
const emailHash = sha256(email.toLowerCase());
const passwordHash = await pbkdf2(password, salt, 600_000, 'sha256');

// Server verifies but never sees plaintext
const user = await prisma.user.findUnique({ where: { emailHash } });
const valid = await verifyPBKDF2(password, user.passwordHash);
```

---

### 2. Devices Table

Each user can have multiple devices (iPhone, Mac, Android, etc.).

```prisma
model Device {
  id              String   @id @default(uuid())
  userId          String
  deviceName      String           // User-friendly name
  publicKey       String           // RSA-4096 public key (SPKI format)
  lastSeenAt      DateTime @default(now())
  createdAt       DateTime @default(now())
}
```

#### Zero-Knowledge Properties
- **Only public key stored**: Private key NEVER leaves client device
- **Signature verification**: Server verifies backups using public key
- **Cannot forge signatures**: Server lacks private key to sign backups

#### Key Generation (Client-Side Only)
```typescript
// Generate RSA-4096 key pair on device
const keyPair = await crypto.subtle.generateKey(
  {
    name: 'RSA-PSS',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,  // extractable
  ['sign', 'verify']
);

// Export public key for server storage
const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);

// CRITICAL: Private key stays on device
// Used for signing backups, never transmitted
```

---

### 3. Backups Table (The Heart of Zero-Knowledge)

Stores **encrypted** backups that the server **cannot** decrypt.

```prisma
model Backup {
  id                String   @id @default(uuid())
  userId            String
  deviceId          String

  // ENCRYPTED DATA (Opaque to server)
  ciphertext        Bytes            // AES-256-GCM encrypted payload
  nonce             Bytes            // 96-bit nonce (unique per backup)
  authTag           Bytes            // 128-bit authentication tag

  // METADATA (Unencrypted but doesn't reveal content)
  sizeBytes         Int              // Total size
  dataClassification String          // "Internal" | "Confidential" | "Restricted"
  createdAt         DateTime @default(now())

  // INTEGRITY VERIFICATION
  signature         String           // RSA-PSS signature
}
```

#### Zero-Knowledge Properties
- **Ciphertext is opaque**: Server stores bytes but cannot decrypt
- **No encryption keys**: Server lacks UMK, DMK, BEK (all client-side only)
- **Signature verification**: Server verifies authenticity without decryption
- **Metadata is safe**: Data classification doesn't reveal content

#### Encryption Flow (Client-Side)

```typescript
// Step 1: Derive Backup Encryption Key (BEK)
// UMK = User Master Key (derived from password, never leaves client)
// DMK = Device Master Key (unique per device, never transmitted)
const bek = await hkdf(umk, dmk, 'backup-encryption-key', 32);

// Step 2: Encrypt backup data (AES-256-GCM)
const nonce = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv: nonce },
  bek,
  backupData
);

// Step 3: Sign backup (RSA-PSS with device private key)
const signature = await crypto.subtle.sign(
  { name: 'RSA-PSS', saltLength: 32 },
  devicePrivateKey,
  ciphertext
);

// Step 4: Upload to server (server cannot decrypt)
await uploadBackup({
  ciphertext,
  nonce,
  authTag: ciphertext.slice(-16),  // GCM tag
  signature,
});
```

#### Decryption Flow (Client-Side Only)

```typescript
// Step 1: Download encrypted backup from server
const backup = await downloadBackup(backupId);

// Step 2: Verify signature (prevents tampering)
const valid = await crypto.subtle.verify(
  { name: 'RSA-PSS', saltLength: 32 },
  devicePublicKey,
  backup.signature,
  backup.ciphertext
);
if (!valid) throw new Error('Backup signature invalid');

// Step 3: Re-derive BEK (same as encryption)
const bek = await hkdf(umk, dmk, 'backup-encryption-key', 32);

// Step 4: Decrypt backup (AES-256-GCM)
const plaintext = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv: backup.nonce },
  bek,
  backup.ciphertext
);
```

---

### 4. Audit Logs Table

Zero-knowledge audit trail for compliance (SOC 2, HIPAA, etc.).

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  userId      String
  action      String            // "backup_created", "device_added", etc.
  ipAddress   String?           // Hashed or truncated
  userAgent   String?
  timestamp   DateTime @default(now())
  metadata    Json?             // NO SENSITIVE DATA
}
```

#### Zero-Knowledge Properties
- **No plaintext data logged**: Actions tracked without revealing content
- **IP privacy**: Addresses hashed or last octet zeroed (192.168.1.0)
- **Metadata is safe**: Only non-sensitive context (sizes, classifications)

#### Usage Pattern
```typescript
await prisma.auditLog.create({
  data: {
    userId: user.id,
    action: 'backup_created',
    ipAddress: hashIP(request.ip),  // Hash or truncate
    metadata: {
      sizeBytes: backup.ciphertext.length,
      dataClassification: 'Confidential',
      // ❌ NEVER log: backup content, user email, device IDs
    },
  },
});
```

---

## Row-Level Security (RLS)

PostgreSQL RLS enforces multi-tenant isolation at the database level.

### Enabling RLS

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

### RLS Policies

```sql
-- Users can only see their own data
CREATE POLICY user_isolation ON users
  FOR ALL
  USING (id = current_setting('app.current_user_id')::uuid);

CREATE POLICY device_isolation ON devices
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY backup_isolation ON backups
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY audit_log_isolation ON audit_logs
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### Setting User Context (In Application Code)

```typescript
// After authentication, set user context for RLS
await prisma.$executeRaw`SET app.current_user_id = ${userId}`;

// Now all queries automatically filter by user
const backups = await prisma.backup.findMany();  // Only user's backups
```

---

## Query Optimization

### Indexes for Performance

```sql
-- Fast user lookup by email hash
CREATE UNIQUE INDEX idx_users_email_hash ON users(email_hash);

-- Fast device queries
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at DESC);

-- Fast backup queries (most recent first)
CREATE INDEX idx_backups_user_created ON backups(user_id, created_at DESC);
CREATE INDEX idx_backups_device_id ON backups(device_id);
CREATE INDEX idx_backups_classification ON backups(data_classification);

-- Fast audit log queries
CREATE INDEX idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
```

### Common Query Patterns

```typescript
// List user's backups (most recent first)
const backups = await prisma.backup.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  take: 20,  // Pagination
});

// List user's devices (most recently active first)
const devices = await prisma.device.findMany({
  where: { userId },
  orderBy: { lastSeenAt: 'desc' },
});

// Compliance report: Restricted data backups
const restrictedBackups = await prisma.backup.findMany({
  where: { dataClassification: 'Restricted' },
  include: { user: true, device: true },
});

// User activity audit trail
const auditLogs = await prisma.auditLog.findMany({
  where: { userId },
  orderBy: { timestamp: 'desc' },
  take: 50,
});
```

---

## Zero-Knowledge Verification Checklist

Before deploying to production, verify these guarantees:

### Database Level
- [ ] No encryption keys stored (UMK, DMK, BEK, MEK)
- [ ] No private keys stored (only public keys)
- [ ] No plaintext passwords (only PBKDF2 hashes)
- [ ] Backup ciphertext is opaque bytes
- [ ] RLS policies enabled on all tables
- [ ] Composite indexes for common queries

### Application Level
- [ ] Keys derived on client only
- [ ] Encryption happens before network transmission
- [ ] Decryption happens after download
- [ ] Signatures verified on server (integrity)
- [ ] No sensitive data in logs or metadata

### Compliance Level
- [ ] Audit logs track actions (not data)
- [ ] IP addresses hashed or truncated
- [ ] Data classifications for reporting
- [ ] User consent for data storage
- [ ] GDPR right-to-erasure (ON DELETE CASCADE)

---

## Development Workflow

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Create database migration
npm run db:migrate

# Seed development data
npm run db:seed

# Open Prisma Studio (GUI)
npm run db:studio

# Reset database (WARNING: Deletes all data)
npm run db:reset
```

---

## Production Deployment

```bash
# 1. Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:password@host:5432/zkeb"

# 2. Generate Prisma client
npm run db:generate

# 3. Deploy migrations (no prompts)
npm run db:migrate:deploy

# 4. Verify RLS policies are active
psql $DATABASE_URL -c "SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';"
```

---

## Security Notes

### Key Derivation Chain
```
Password (user input)
  ↓ PBKDF2 (600k iterations)
User Master Key (UMK) ───┐
                         ↓ HKDF
Device Master Key (DMK) ──→ Backup Encryption Key (BEK)
                         ↓ HKDF
                         → Metadata Encryption Key (MEK)
```

### Data Flow
```
Client Device          Server              Database
─────────────          ──────              ────────
[Plaintext] ──┐
              │
              ↓ Encrypt (BEK)
              │
[Ciphertext] ─┴─→ Upload ──→ Store [Ciphertext]
                                   (opaque bytes)
```

### Threat Model
- ✅ Protects against: Server compromise, database breach, insider threats
- ✅ Server cannot: Decrypt backups, identify users, forge signatures
- ⚠️ Does NOT protect against: Client-side malware, password phishing, device theft

---

## References

- **NIST SP 800-38D**: AES-GCM authenticated encryption
- **RFC 5869**: HKDF key derivation
- **OWASP 2023**: Password storage (PBKDF2 600k iterations)
- **Prisma Docs**: Row-Level Security patterns
- **Zero-Knowledge Proofs**: Applied cryptography principles
