import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLoginCredentials } from './auth.js';

test('reports required login fields and invalid email formats', () => {
  assert.deepEqual(validateLoginCredentials({}), {
    email: 'Enter your email address.',
    password: 'Enter your password.',
  });
  assert.equal(validateLoginCredentials({ email: 'not-an-email', password: 'long-enough' }).email, 'Enter a valid email address.');
});

test('accepts trimmed valid email and passwords of at least eight characters', () => {
  assert.deepEqual(validateLoginCredentials({ email: '  person@example.com ', password: 'password' }), {});
  assert.deepEqual(validateLoginCredentials({ email: 'person@localhost', password: 'password' }), {});
  assert.equal(validateLoginCredentials({ email: 'person@example.com', password: 'short' }).password, 'Use at least 8 characters.');
});
