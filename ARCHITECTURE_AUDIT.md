# Stockwise Phase 0 Architecture Audit

Date: 2026-10-01

## Executive Summary

The repository currently contains a React/Vite frontend only. There is no backend, API, database, migration system, server-side authentication, queue, object storage, Docker configuration, CI pipeline, or deployment configuration.

The frontend is a functional local prototype with product, warehouse, operations, procurement, sales, fulfillment, returns, approvals, reporting, billing, import/export, audit-style views, forecasting signals, and browser-side role controls. Business data is persisted in versioned `localStorage`/`sessionStorage` envelopes. The frontend must not remain the source of truth for production use.

## Current Technology

- React 19, React DOM, React-Bootstrap, Bootstrap, Vite.
- Node's built-in test runner for focused unit tests.
- JavaScript/JSX, no TypeScript or lint/type-check configuration.
- Browser storage adapter with `STORAGE_VERSION = 1` and migration hooks.
- Pure client services for auth validation, inventory operations, orders, billing, imports, and warehouse profiles.
- No API client or server contract.

## Frontend Feature Inventory

| Feature | Current implementation | Backend boundary required |
| --- | --- | --- |
| Authentication | Demo users and browser session state in `App.jsx`; local validation only | Registration, login, logout, sessions, password reset, email verification, MFA boundary, rate limiting |
| Roles/access | `roleDefinitions` controls visible pages in the browser | Memberships, roles, permissions, policy checks on every protected request |
| Products | Product catalog in local state/storage; SKU, barcode, description, category, supplier, price, unit, reorder, stock map | Organization-scoped products, categories, suppliers, constraints, pagination, audit |
| Import/export | CSV/TSV/JSON parsing and client preview/mapping; CSV downloads | Import jobs, idempotency, validation reports, object storage, permission checks |
| Warehouses | Location names plus local capacity/bin metadata | Warehouses, zones, aisles, racks, shelves, bins, capacity, utilization, cycle counts |
| Inventory | Client-side receipt, delivery, transfer, adjustment and capacity checks | Transactional ledger, row locking/optimistic concurrency, reservations, idempotency, audit |
| Procurement | Suppliers and purchase orders stored locally; draft/approval flow | Supplier records, purchase requests, PO lifecycle, goods receipts, quality checks, bills |
| Customers/sales | Customers and sales orders stored locally; local reservation check | Customers, order items, reservations, fulfillment, credit rules, audit |
| Fulfillment | Local shipments deduct product stock and update order status | Pick/pack/dispatch workflow, shipment events, concurrency and idempotency |
| Returns | Local return creation and approval queue | Return authorization, inspection, refund/credit boundary, stock disposition |
| Billing | Invoices, payments, outstanding calculations in browser | Invoice/payment records, provider adapter, webhook verification, no raw card data |
| Reports | Derived in-browser from local records | Authoritative queries, date/tenant filters, pagination, async report jobs, exports |
| Forecasting | Dated fulfilled-order signals with explicit evidence/confidence; heuristics | Derived analytics pipeline, explainable metrics, data freshness and quality metadata |
| Notifications | UI notification/exception patterns from local state | Notification records, preferences, delivery adapters, background jobs |
| Audit | Derived audit-style view from local records | Append-only audit log with actor, tenant, request ID, before/after, timestamp |
| Settings | Currency, unit, alert threshold, theme in browser storage | Organization settings with server authorization and change audit |

## Current Trust Boundaries and Risks

1. Browser storage can be edited, deleted, replayed, or copied by the user. It cannot protect business data.
2. Browser role checks are UX only. A malicious client can bypass every page restriction.
3. Inventory quantities are calculated in the client and can race across tabs/devices.
4. There is no tenant identity or organization boundary.
5. Audit entries are derived from mutable client records and are not tamper-resistant.
6. Payments are bookkeeping records only; no payment processor is connected.
7. Forecasts are intentionally limited to measured dated demand; they are not validated statistical forecasts.
8. There is no server-side rate limiting, CSRF/session protection, security headers, request validation, structured error contract, or observability.
9. There are no API, integration, security, concurrency, or end-to-end tests.
10. No production backend should be inferred from the current frontend behavior until a reference backend is provided and audited.

## Proposed Backend Architecture

Use a modular monolith first, with explicit module boundaries:

- Node.js + TypeScript.
- REST API under `/api/v1` with OpenAPI documentation.
- PostgreSQL with Prisma or another mature migration-based ORM.
- Argon2id password hashing and secure, rotating HttpOnly sessions.
- Zod (or equivalent) request/response validation.
- Centralized authorization policy service with organization membership checks.
- Redis only for sessions, rate limits, queues, and selected derived caches.
- BullMQ or equivalent for imports, reports, notifications, webhooks, and forecasting jobs.
- S3-compatible private object storage for documents/images, with generated keys and signed URLs.
- Structured logs, request IDs, health/readiness endpoints, and metrics.
- Docker Compose for local PostgreSQL/Redis development; multi-stage production image.

The first implementation should be a modular monolith, not microservices. Domain services must own business rules; controllers should only translate HTTP to service calls.

## Core Data Model

Initial normalized entities:

- Organization, OrganizationSetting, User, Membership, Role, Permission, Session, Invitation.
- Product, Category, Supplier, Customer.
- Warehouse, Zone, Aisle, Rack, Shelf, Bin.
- InventoryBalance, StockMovement, StockReservation, CycleCount.
- PurchaseOrder, PurchaseOrderItem, GoodsReceipt.
- SalesOrder, SalesOrderItem, Shipment, Return.
- Invoice, InvoiceItem, Payment, Refund.
- Notification, AuditLog, Attachment.
- IdempotencyKey, APIKey, WebhookSubscription, WebhookDelivery.

Every organization-owned table needs an organization ID, foreign keys, indexes, timestamps, and authorization-aware repository access. Inventory mutations must use transactions and concurrency controls.

## Initial API Mapping

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh` or rotating session equivalent
- `GET /api/v1/auth/me`
- `GET/PATCH /api/v1/organizations/current`
- `GET/POST/PATCH/DELETE /api/v1/products`
- `GET/POST/PATCH/DELETE /api/v1/warehouses`
- `GET/POST /api/v1/warehouses/:id/locations`
- `POST /api/v1/inventory/receipts`
- `POST /api/v1/inventory/issues`
- `POST /api/v1/inventory/transfers`
- `POST /api/v1/inventory/adjustments`
- `POST /api/v1/inventory/reservations`
- `POST /api/v1/inventory/reservations/:id/release`
- `GET /api/v1/inventory/movements`
- `GET/POST/PATCH /api/v1/suppliers`
- `GET/POST/PATCH /api/v1/purchase-orders`
- `POST /api/v1/purchase-orders/:id/approve`
- `POST /api/v1/purchase-orders/:id/receipts`
- `GET/POST/PATCH /api/v1/customers`
- `GET/POST/PATCH /api/v1/sales-orders`
- `POST /api/v1/sales-orders/:id/confirm`
- `POST /api/v1/sales-orders/:id/shipments`
- `POST /api/v1/returns`
- `POST /api/v1/returns/:id/approve`
- `GET/POST /api/v1/invoices`
- `POST /api/v1/invoices/:id/payments`
- `GET /api/v1/reports/*`
- `GET /api/v1/notifications`
- `GET /api/v1/audit-logs`
- `POST /api/v1/imports` and `GET /api/v1/imports/:id`

All tenant-owned routes require authenticated membership and centralized permission checks. Client-supplied organization IDs, actor IDs, totals, permissions, and inventory balances must be ignored or recomputed server-side.

## Permission Baseline

Start with centralized permissions rather than page names:

- `product.read/create/update/delete`
- `inventory.read/receive/issue/adjust/transfer/reserve`
- `warehouse.read/manage/count`
- `supplier.read/manage`
- `purchase.read/create/approve/receive`
- `customer.read/manage`
- `sales.read/create/approve/ship/return`
- `invoice.read/create/approve/record_payment`
- `report.view/export`
- `notification.read/manage`
- `audit.view`
- `user.manage`
- `organization.manage`

Frontend roles remain useful for navigation, but backend policies are the security boundary.

## Implementation Phases

1. Foundation: TypeScript service, configuration, API versioning, error contract, logging, PostgreSQL migrations, health/readiness, test harness.
2. Identity: organizations, memberships, Argon2id passwords, secure sessions, logout/revocation, rate limits, RBAC.
3. Inventory: products, warehouses/locations, ledger, transactional receive/issue/transfer/adjust/reserve, idempotency, audit.
4. Business operations: suppliers, procurement, customers, sales, fulfillment, returns, invoices, payment-provider boundary.
5. Platform services: notifications, imports, files, jobs, webhooks, API keys, audit hardening.
6. Analytics: authoritative reports, derived metrics, forecasting data quality and evidence.
7. Security/production: threat model, security tests, Docker, CI, dependency scanning, backups, restore procedure, deployment docs.
8. Frontend migration: typed API client, local-data export/import migration, server-backed loading and mutations, offline conflict handling only after server contracts exist.

## Phase 0 Exit Criteria

- Repository and frontend contracts are mapped: complete.
- Current trust boundaries and risks are documented: complete.
- Backend stack recommendation is justified: complete.
- No production backend code has been added prematurely: complete.
- Next phase requires either approval to scaffold the backend or the reference `Stockwise-Test.zip` for compatibility analysis.
