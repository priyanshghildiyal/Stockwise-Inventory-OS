# Stockwise API Foundation

Base URL: `/api/v1`

## Health

- `GET /health` returns process health.
- `GET /ready` returns readiness and identifies the current persistence adapter.

## Authentication

- `POST /auth/register`
  - Body: `{ name, email, password, organizationName }`
  - Password must be 12-128 characters.
- `POST /auth/login`
  - Body: `{ email, password }`
- `GET /auth/me`
  - Requires the HttpOnly session cookie.
- `POST /auth/logout`
  - Revokes the current session and clears the cookie.
- `GET /products?search=term`
  - Requires `product.read`.
- `POST /products`
  - Requires `product.create`.
  - Product ownership is taken from the authenticated organization.
- `GET /warehouses`
  - Requires `warehouse.read`.
- `POST /warehouses`
  - Requires `warehouse.manage`.
  - Capacity must be a positive number when provided.

Successful authentication returns a public user record and session expiry. The session token is not returned in the JSON response.

## Error Contract

Errors use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "requestId": "request-id"
  }
}
```

Production responses do not expose stack traces, SQL, filesystem paths, or secrets.

## Planned Resource Modules

Products and warehouses are now organization-scoped modules backed by repository interfaces. The Prisma schema and Phase 0 mapping reserve additional modules for inventory, suppliers, procurement, customers, sales, fulfillment, returns, invoices, payments, reports, notifications, and audit logs. These routes must be added behind authenticated membership and centralized permission checks; client-provided organization IDs, actor IDs, permissions, totals, and inventory balances must never be trusted.
