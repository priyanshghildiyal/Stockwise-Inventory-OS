import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createApp } from './app.js';

test('exposes health and cookie-backed auth endpoints', async (t) => {
  const server = createServer(createApp()).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  t.after(() => server.close());
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const registration = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse battery staple', organizationName: 'Northstar' }),
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get('set-cookie');
  assert.match(cookie || '', /HttpOnly/i);
  assert.match(cookie || '', /SameSite=Lax/i);

  const me = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: cookie?.split(';')[0] || '' } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.user.organization, 'Northstar');

  const product = await fetch(`${baseUrl}/api/v1/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie?.split(';')[0] || '' },
    body: JSON.stringify({ sku: 'SKU-001', name: 'Copper cable', unit: 'meters', reorderPoint: 10 }),
  });
  assert.equal(product.status, 201);
  assert.equal((await product.json()).data.organizationId.length > 0, true);

  const products = await fetch(`${baseUrl}/api/v1/products?search=copper`, { headers: { cookie: cookie?.split(';')[0] || '' } });
  assert.equal(products.status, 200);
  assert.equal((await products.json()).data.items.length, 1);

  const warehouse = await fetch(`${baseUrl}/api/v1/warehouses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie?.split(';')[0] || '' },
    body: JSON.stringify({ name: 'Main Warehouse', capacity: 1000 }),
  });
  assert.equal(warehouse.status, 201);
  assert.equal((await warehouse.json()).data.capacity, 1000);
});
