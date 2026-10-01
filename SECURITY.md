# Stockwise Security Foundation

## Current Controls

- Passwords are hashed with Argon2id; plaintext passwords are never stored.
- Sessions use random opaque tokens, stored as SHA-256 hashes in the session store, and returned only in HttpOnly, SameSite=Lax cookies.
- Production cookies are marked Secure.
- Authentication endpoints are rate limited.
- Request bodies are size-limited and validated with Zod.
- Helmet security headers, strict configured CORS, request IDs, and structured logging are enabled.
- Cookies and authorization headers are redacted from request logs.
- Permissions are centralized by role in `server/src/auth/permissions.ts`.
- Product and warehouse routes derive organization ownership from the authenticated session rather than request bodies.
- Production startup refuses to run without `DATABASE_URL`.

## Current Limitation

The development server currently uses an in-memory auth adapter so it can run without external services. It is not production persistence. The Prisma PostgreSQL schema is present, but the repository adapter, migrations, organization membership queries, and server-backed resource modules are not complete yet.

Do not deploy the memory adapter. The next identity phase must replace it with PostgreSQL-backed users, memberships, sessions, revocation, and audit records before production use.

## Threat to Control Mapping

| Threat | Control | Status |
| --- | --- | --- |
| Credential theft from logs | Redact cookie and authorization headers | Implemented |
| Password database compromise | Argon2id password hashing | Implemented |
| Brute-force login | Auth route rate limit | Foundation implemented; distributed Redis limiter pending |
| Cross-tenant access | Organization IDs and membership checks | Products/warehouses enforce session organization; broader modules pending |
| Broken role checks | Centralized permission map | Foundation implemented; route enforcement pending |
| Session replay | Opaque random tokens, expiry, revocation model | In-memory foundation; persistent rotation pending |
| Request injection | Zod input validation and parameterized ORM target | Validation implemented; resource routes pending |
| Sensitive error leakage | Standardized production error response | Implemented |

## Required Before Production

- PostgreSQL-backed repositories and migrations.
- Secure session persistence, rotation, revocation, and device management.
- Authorization checks on every tenant-owned resource.
- CSRF strategy for cookie-authenticated state-changing requests.
- Distributed rate limiting and brute-force controls.
- Security, tenant-isolation, IDOR, concurrency, upload, and dependency tests.
- Secret manager, TLS, backups, restore tests, monitoring, and incident procedures.
