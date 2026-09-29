import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvoiceOutstanding, getPaymentValidationError } from './billing.js';

const invoice = { id: 'INV-1', kind: 'Invoice', amount: 100 };

test('calculates outstanding invoice balances from valid positive payments', () => {
  assert.equal(getInvoiceOutstanding(100, [{ amount: 35 }]), 65);
  assert.equal(getInvoiceOutstanding(100, [{ amount: 35 }, { amount: 80 }]), 0);
  assert.equal(getInvoiceOutstanding(100, [{ amount: -2 }, { amount: 'invalid' }]), 100);
});

test('validates payments against invoice type, positive amount, and remaining balance', () => {
  assert.match(getPaymentValidationError(null, 10), /valid invoice/);
  assert.match(getPaymentValidationError({ ...invoice, kind: 'Bill' }, 10), /valid invoice/);
  assert.match(getPaymentValidationError(invoice, 0), /greater than zero/);
  assert.match(getPaymentValidationError(invoice, Number.NaN), /greater than zero/);
  assert.match(getPaymentValidationError(invoice, 66, [{ amount: 35 }]), /exceeds the outstanding balance/);
  assert.equal(getPaymentValidationError(invoice, 65, [{ amount: 35 }]), '');
});
