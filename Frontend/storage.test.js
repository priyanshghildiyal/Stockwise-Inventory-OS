import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_VERSION,
  migrateStoredValue,
  readStorageValue,
  removeStorageValue,
  sanitizeStoredArray,
  writeStorageValue,
} from './storage.js';

test('migrates legacy unversioned JSON values without changing their data', () => {
  const legacy = [{ id: 7, name: 'Widget' }];
  assert.deepEqual(migrateStoredValue('products', legacy, 0), legacy);
});

test('applies registered migrations sequentially for a key', () => {
  const migrationMap = {
    'products:0': (value) => ({ ...value, sku: value.code }),
  };
  assert.deepEqual(
    migrateStoredValue('products', { code: 'W-1' }, 0, migrationMap),
    { code: 'W-1', sku: 'W-1' },
  );
});

test('returns the provided fallback for non-array saved collections', () => {
  const fallback = [];
  assert.equal(sanitizeStoredArray({ invalid: true }, fallback), fallback);
});

test('filters only entries rejected by the supplied legacy detector', () => {
  const saved = [{ id: 'keep' }, { id: 'legacy' }];
  assert.deepEqual(sanitizeStoredArray(saved, [], (entry) => entry.id === 'legacy'), [{ id: 'keep' }]);
});

test('writes current data in a versioned envelope and reads it back', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const saved = { id: 'P-1', stock: { Main: 4 } };

  assert.equal(writeStorageValue(storage, 'products', saved), true);
  assert.deepEqual(JSON.parse(values.get('products')), {
    __stockwiseStorage: true,
    version: STORAGE_VERSION,
    value: saved,
  });
  assert.deepEqual(readStorageValue(storage, 'products', []), saved);
});

test('reads existing unversioned browser data unchanged', () => {
  const storage = { getItem: () => JSON.stringify([{ sku: 'OLD-1' }]) };
  assert.deepEqual(readStorageValue(storage, 'products', []), [{ sku: 'OLD-1' }]);
});

test('uses fallback for malformed JSON and unsupported future storage versions', () => {
  const fallback = [];
  assert.equal(readStorageValue({ getItem: () => '{bad json' }, 'products', fallback), fallback);
  const future = JSON.stringify({ __stockwiseStorage: true, version: STORAGE_VERSION + 1, value: ['future'] });
  assert.equal(readStorageValue({ getItem: () => future }, 'products', fallback), fallback);
});

test('does not overwrite data written by a newer application version', () => {
  const future = JSON.stringify({ __stockwiseStorage: true, version: STORAGE_VERSION + 1, value: ['future'] });
  let saved = future;
  const storage = {
    getItem: () => saved,
    setItem: (_key, value) => { saved = value; },
  };
  assert.equal(writeStorageValue(storage, 'products', []), false);
  assert.equal(saved, future);
});

test('handles storage access failures without throwing', () => {
  const storage = {
    getItem: () => { throw new Error('unavailable'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('unavailable'); },
  };
  assert.deepEqual(readStorageValue(storage, 'products', []), []);
  assert.equal(writeStorageValue(storage, 'products', []), false);
  assert.equal(removeStorageValue(storage, 'products'), false);
});

test('removes saved data through the storage adapter', () => {
  const values = new Map([['session', 'saved']]);
  const storage = { removeItem: (key) => values.delete(key) };
  assert.equal(removeStorageValue(storage, 'session'), true);
  assert.equal(values.has('session'), false);
});

test('storage format has a positive current version', () => {
  assert.ok(Number.isInteger(STORAGE_VERSION));
  assert.ok(STORAGE_VERSION > 0);
});
