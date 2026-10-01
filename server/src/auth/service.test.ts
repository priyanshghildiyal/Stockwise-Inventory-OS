import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthService } from './service.js';
import { MemoryAuthStore } from './store.js';

test('registers with Argon2id-backed credentials and authenticates an opaque session', async () => {
  const store = new MemoryAuthStore();
  const auth = new AuthService(store);
  const registered = await auth.register({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse battery staple', organizationName: 'Northstar' });

  assert.equal(registered.user.email, 'jordan@example.com');
  assert.notEqual(registered.token, undefined);
  assert.equal((await store.findUserByEmail('jordan@example.com'))?.passwordHash.startsWith('$argon2id$'), true);
  assert.equal((await auth.authenticate(registered.token))?.user.organization, 'Northstar');
});

test('rejects duplicate registrations and invalid credentials', async () => {
  const auth = new AuthService(new MemoryAuthStore());
  await auth.register({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse battery staple', organizationName: 'Northstar' });
  await assert.rejects(() => auth.register({ name: 'Other User', email: 'jordan@example.com', password: 'correct horse battery staple', organizationName: 'Other' }), { name: 'ConflictError' });
  await assert.rejects(() => auth.login('jordan@example.com', 'wrong password'), { name: 'AuthenticationError' });
});
