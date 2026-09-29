import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeStoredArray } from './storage.js';

test('removes only matching legacy records from saved collections', () => {
  const fallback = [];
  const saved = [
    { id: 'legacy', name: 'Old product' },
    { id: 'current', name: 'Current product' },
  ];

  const result = sanitizeStoredArray(saved, fallback, (entry) => entry.id === 'legacy');

  assert.deepEqual(result, [{ id: 'current', name: 'Current product' }]);
  assert.notEqual(result, fallback);
});

test('uses fallback for malformed saved collections', () => {
  const fallback = [];

  assert.equal(sanitizeStoredArray({ invalid: true }, fallback), fallback);
});

test('preserves valid records when no legacy detector is needed', () => {
  const saved = [{ id: 'supplier-1', name: 'Current supplier' }];

  assert.deepEqual(sanitizeStoredArray(saved, []), saved);
});