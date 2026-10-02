import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.js';
import { AuthService } from '../auth/service.js';
import { MemoryAuthStore } from '../auth/store.js';
import { MemoryInventoryStore } from './store.js';

test('creates inventory adjustments and reservations in the same organization', async () => {
  const auth = new AuthService(new MemoryAuthStore());
  const registered = await auth.register({
    name: 'Jordan',
    email: 'inventory@example.com',
    password: 'correct horse battery staple',
    organizationName: 'Northstar',
  });

  const app = createApp(auth);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = Number((server.address() as any).port);
  const baseUrl = `http://127.0.0.1:${port}`;
  const authCookie = `stockwise_session=${registered.token}`;

  const product = await fetch(`${baseUrl}/api/v1/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: authCookie },
    body: JSON.stringify({ sku: 'INV-001', name: 'Steel rod', unit: 'kg', reorderPoint: 5 }),
  });
  assert.equal(product.status, 201);

  const warehouse = await fetch(`${baseUrl}/api/v1/warehouses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: authCookie },
    body: JSON.stringify({ name: 'A1', capacity: 2000 }),
  });
  assert.equal(warehouse.status, 201);

  const productId = (await product.json()).data.id;
  const warehouseId = (await warehouse.json()).data.id;

  const receive = await fetch(`${baseUrl}/api/v1/inventory/adjustments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: authCookie },
    body: JSON.stringify({ productId, warehouseId, quantity: 40, type: 'RECEIPT', reason: 'Initial receipt' }),
  });
  assert.equal(receive.status, 201);

  const reserve = await fetch(`${baseUrl}/api/v1/inventory/reservations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: authCookie },
    body: JSON.stringify({ productId, warehouseId, quantity: 12 }),
  });
  assert.equal(reserve.status, 201);
  const reservation = await reserve.json();
  assert.equal(reservation.data.quantity, 12);

  const movement = await fetch(`${baseUrl}/api/v1/inventory/movements?productId=${productId}`, {
    headers: { cookie: authCookie },
  });
  assert.equal(movement.status, 200);
  const movementBody = await movement.json();
  assert.equal(movementBody.data.items.length >= 2, true);

  server.close();
});

test('memory inventory store validates insufficient stock before reservation', async () => {
  const store = new MemoryInventoryStore();
  const result = await store.reserve({ organizationId: 'org-1', productId: 'p1', warehouseId: 'w1', quantity: 25, reason: 'Delivery', createdByUserId: 'u1' });
  assert.equal(result.error, 'Insufficient available stock.');
});
