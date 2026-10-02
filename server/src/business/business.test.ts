import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.js';
import { AuthService } from '../auth/service.js';
import { MemoryAuthStore } from '../auth/store.js';

test('organization-scoped suppliers, customers, and orders are created through the API', async () => {
  const auth = new AuthService(new MemoryAuthStore());
  const registered = await auth.register({
    name: 'Ops Lead',
    email: 'business@example.com',
    password: 'correct horse battery staple',
    organizationName: 'Northstar',
  });

  const app = createApp(auth);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = Number((server.address() as any).port);
  const cookie = `stockwise_session=${registered.token}`;

  const supplier = await fetch(`http://127.0.0.1:${port}/api/v1/suppliers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Prime Supply', email: 'hello@primesupply.example' }),
  });
  assert.equal(supplier.status, 201);

  const customer = await fetch(`http://127.0.0.1:${port}/api/v1/customers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Boro Retail', email: 'billing@bororetail.example' }),
  });
  assert.equal(customer.status, 201);

  const order = await fetch(`http://127.0.0.1:${port}/api/v1/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'SALE', reference: 'SO-1001', customerOrSupplier: 'Boro Retail', status: 'DRAFT', total: 2500 }),
  });
  assert.equal(order.status, 201);
  assert.equal((await order.json()).data.reference, 'SO-1001');

  const list = await fetch(`http://127.0.0.1:${port}/api/v1/orders`, { headers: { cookie } });
  assert.equal(list.status, 200);
  const orders = await list.json();
  assert.equal(orders.data.items.length, 1);

  server.close();
});
