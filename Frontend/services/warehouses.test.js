import test from 'node:test';
import assert from 'node:assert/strict';
import { getWarehouseCapacityStatus, normalizeWarehouseProfile, validateWarehouseCapacity } from './warehouses.js';

test('normalizes legacy and configured warehouse profiles', () => {
  assert.deepEqual(normalizeWarehouseProfile({}, 'Main Warehouse'), {
    name: 'Main Warehouse', capacity: null, bins: [],
  });
  assert.deepEqual(normalizeWarehouseProfile({ name: ' East ', capacity: '100', bins: 'A-01, A-02, A-01' }), {
    name: 'East', capacity: 100, bins: ['A-01', 'A-02'],
  });
});

test('reports warehouse capacity bands and over-capacity validation', () => {
  assert.equal(getWarehouseCapacityStatus(40, 100).status, 'Available');
  assert.equal(getWarehouseCapacityStatus(90, 100).status, 'Near capacity');
  assert.equal(getWarehouseCapacityStatus(100, 100).status, 'Full');
  assert.equal(validateWarehouseCapacity(101, 100), 'Warehouse capacity exceeded by 1 units.');
  assert.equal(validateWarehouseCapacity(101, null), null);
});
