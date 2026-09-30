import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInventoryOperation,
  getShipmentBlockReason,
  getInvoiceOutstanding,
  normalizeImportedProduct,
  renameWarehouseInOperation,
} from './domain.js';

test('stock receipt and delivery apply exact signed quantities', () => {
  assert.deepEqual(applyInventoryOperation({ Main: 8 }, {
    type: 'Receipt', quantity: 3, location: 'Main',
  }), { stock: { Main: 11 }, error: null });
  assert.deepEqual(applyInventoryOperation({ Main: 8 }, {
    type: 'Delivery', quantity: 3, location: 'Main',
  }), { stock: { Main: 5 }, error: null });
});

test('stock transfer preserves total quantity and rejects insufficient stock', () => {
  const transfer = applyInventoryOperation({ Main: 8, East: 2 }, {
    type: 'Internal', quantity: 5, location: 'Main', destination: 'East',
  });
  assert.deepEqual(transfer, { stock: { Main: 3, East: 7 }, error: null });
  assert.equal(transfer.stock.Main + transfer.stock.East, 10);
  assert.equal(applyInventoryOperation({ Main: 1 }, {
    type: 'Delivery', quantity: 2, location: 'Main',
  }).error, 'Not enough stock in the selected source location.');
});

test('stock counts set absolute quantity and invalid operations do not mutate saved stock', () => {
  const original = { Main: 4 };
  assert.deepEqual(applyInventoryOperation(original, {
    type: 'Adjustment', quantity: 9, location: 'Main',
  }), { stock: { Main: 9 }, error: null });
  assert.deepEqual(original, { Main: 4 });
  assert.equal(applyInventoryOperation(original, {
    type: 'Internal', quantity: 1, location: 'Main', destination: 'Main',
  }).error, 'Choose a different destination for an internal transfer.');
});

test('warehouse rename changes transfer endpoints without changing partner references', () => {
  const receipt = { type: 'Receipt', location: 'Main Warehouse', partner: 'Main Warehouse Supply' };
  const transfer = { type: 'Internal', location: 'Main Warehouse', partner: 'Main Warehouse → Overflow' };

  assert.deepEqual(renameWarehouseInOperation(receipt, 'Main Warehouse', 'Central'), {
    type: 'Receipt', location: 'Central', partner: 'Main Warehouse Supply',
  });
  assert.deepEqual(renameWarehouseInOperation(transfer, 'Main Warehouse', 'Central'), {
    type: 'Internal', location: 'Central', partner: 'Central → Overflow',
  });
  assert.equal(receipt.location, 'Main Warehouse');
});

test('shipment validation blocks missing, shipped, duplicate, and empty orders', () => {
  assert.ok(getShipmentBlockReason(null).includes('Select a valid'));
  assert.ok(getShipmentBlockReason({ id: 'SO-1', status: 'Shipped', qty: 2 }).includes('already been shipped'));
  assert.ok(getShipmentBlockReason({ id: 'SO-1', status: 'Confirmed', qty: 2 }, [{ orderId: 'SO-1' }]).includes('already been shipped'));
  assert.ok(getShipmentBlockReason({ id: 'SO-2', status: 'Confirmed', qty: 0 }).includes('no units'));
  assert.equal(getShipmentBlockReason({ id: 'SO-3', status: 'Confirmed', qty: 2 }), '');
});

test('invoice outstanding balance accounts for partial and excess recorded payments', () => {
  assert.equal(getInvoiceOutstanding(100, [{ amount: 35 }]), 65);
  assert.equal(getInvoiceOutstanding(100, [{ amount: 35 }, { amount: 80 }]), 0);
  assert.equal(getInvoiceOutstanding(100, []), 100);
});

test('import normalization accepts supported aliases and rejects invalid rows', () => {
  assert.deepEqual(normalizeImportedProduct({
    product: '  Cable  ', code: ' cb-1 ', onhand: '12', unitprice: '3.5', minimumstock: '4', uom: 'meters',
  }), {
    name: 'Cable', sku: 'CB-1', barcode: '', description: '', material: '', supplierName: '', category: 'Other', unit: 'meters', quantity: 12, price: 3.5, reorder: 4,
  });
  assert.equal(normalizeImportedProduct({ name: 'Bolt', sku: 'B-1', preferredsupplier: 'Apex' }).supplierName, 'Apex');
  assert.equal(normalizeImportedProduct({ name: 'Missing SKU' }), null);
  assert.equal(normalizeImportedProduct({ name: 'Bad quantity', sku: 'X', quantity: -2 }), null);
  assert.equal(normalizeImportedProduct(null), null);
});
