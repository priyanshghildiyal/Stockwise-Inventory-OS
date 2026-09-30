import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, parseProductImportText } from './productImport.js';

test('parses quoted delimiters, escaped quotes, BOM, and CRLF rows', () => {
  assert.deepEqual(
    parseDelimited('\uFEFFname,description\r\nCable,"Heavy, 1/2"" copper"\r\n'),
    [['name', 'description'], ['Cable', 'Heavy, 1/2" copper']],
  );
});

test('normalizes CSV and TSV product records while reporting invalid rows', () => {
  const csv = parseProductImportText(
    'Product Name,SKU,On Hand,Unit Price\nWidget,W-1,5,3.25\nMissing SKU,,2,1',
    'csv',
  );
  assert.equal(csv.products.length, 1);
  assert.equal(csv.products[0].name, 'Widget');
  assert.equal(csv.products[0].sku, 'W-1');
  assert.equal(csv.products[0].quantity, 5);
  assert.equal(csv.products[0].sourceRow, 2);
  assert.equal(csv.skipped, 1);
  assert.deepEqual(csv.errors, [{ row: 3, issue: 'SKU is required.' }]);

  const tsv = parseProductImportText('name\tsku\tqty\nBolt\tb-2\t8', 'tsv', 'pieces');
  assert.equal(tsv.products[0].unit, 'pieces');
  assert.equal(tsv.products[0].quantity, 8);
});

test('skips repeated SKUs case-insensitively and reports their source row', () => {
  const result = parseProductImportText(
    'name,sku,qty\nBolt,b-2,8\nReplacement,B-2,4',
    'csv',
  );

  assert.equal(result.products.length, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.errors, [{ row: 3, issue: 'Duplicate SKU "B-2" in import.' }]);
});

test('imports preferred supplier names from common column aliases', () => {
  const csv = parseProductImportText(
    'name,sku,preferred supplier\nWasher,W-1,Apex Materials',
    'csv',
  );
  const json = parseProductImportText('[{"name":"Bolt","sku":"B-1","vendor":"Northstar Supply"}]', 'json');

  assert.equal(csv.products[0].supplierName, 'Apex Materials');
  assert.equal(json.products[0].supplierName, 'Northstar Supply');
});

test('maps custom source columns into product fields', () => {
  const result = parseProductImportText(
    'Item Label,Item Number,Available Units,Retail USD,GTIN,Long description\nCopper cable,SKU-8,4,2.75,4006381333931,Shielded copper cable',
    'csv',
    'units',
    { name: 'Item Label', sku: 'Item Number', quantity: 'Available Units', price: 'Retail USD', barcode: 'GTIN', description: 'Long description' },
  );

  assert.deepEqual(result.headers, ['Item Label', 'Item Number', 'Available Units', 'Retail USD', 'GTIN', 'Long description']);
  assert.equal(result.products[0].name, 'Copper cable');
  assert.equal(result.products[0].sku, 'SKU-8');
  assert.equal(result.products[0].quantity, 4);
  assert.equal(result.products[0].price, 2.75);
  assert.equal(result.products[0].barcode, '4006381333931');
  assert.equal(result.products[0].description, 'Shielded copper cable');
});

test('accepts JSON arrays and products envelopes and rejects malformed tabular input', () => {
  const arrayResult = parseProductImportText('[{"name":"Nut","sku":"N-1"}]', 'json');
  const envelopeResult = parseProductImportText('{"products":[{"name":"Washer","sku":"W-2"}]}', 'json');
  assert.equal(arrayResult.products[0].name, 'Nut');
  assert.equal(arrayResult.products[0].sourceRow, 1);
  assert.equal(envelopeResult.products[0].name, 'Washer');
  assert.throws(() => parseProductImportText('name,sku', 'csv'), /header row and at least one product row/);
  assert.throws(() => parseDelimited('name,description\nCable,"unfinished'), /quoted field was not closed/);
  assert.throws(() => parseProductImportText('{bad json', 'json'));
});
