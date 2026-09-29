import test from 'node:test';
import assert from 'node:assert/strict';
import { deductShipmentStock, getShipmentBlockReason } from './orders.js';

test('rejects shipment attempts without a valid order or shippable quantity', () => {
  assert.match(getShipmentBlockReason(null), /valid sales order/);
  assert.match(getShipmentBlockReason({ id: 'SO-1', status: 'Confirmed', qty: 0 }), /no units/);
  assert.match(getShipmentBlockReason({ id: 'SO-1', status: 'Confirmed', qty: -2 }), /no units/);
});

test('blocks shipped or previously shipped orders and allows one valid shipment', () => {
  assert.match(getShipmentBlockReason({ id: 'SO-1', status: 'Shipped', qty: 2 }), /already been shipped/);
  assert.match(
    getShipmentBlockReason({ id: 'SO-1', status: 'Confirmed', qty: 2 }, [{ orderId: 'SO-1' }]),
    /already been shipped/,
  );
  assert.equal(getShipmentBlockReason({ id: 'SO-2', status: 'Confirmed', qty: 2 }), '');
});

test('deducts shipment stock once from its warehouse without mutating the original', () => {
  const stock = { Main: 8, East: 3 };
  assert.deepEqual(deductShipmentStock(stock, 5, 'Main'), {
    stock: { Main: 3, East: 3 },
    error: null,
  });
  assert.deepEqual(stock, { Main: 8, East: 3 });
  assert.equal(deductShipmentStock(stock, 9, 'Main').error, 'Not enough stock in this warehouse to create the shipment.');
  assert.equal(deductShipmentStock(stock, 1, 'Missing').error, 'Not enough stock in this warehouse to create the shipment.');
});

test('rejects invalid shipment quantities and locations', () => {
  assert.ok(deductShipmentStock({ Main: 8 }, 0, 'Main').error);
  assert.ok(deductShipmentStock({ Main: 8 }, 1, '').error);
});
