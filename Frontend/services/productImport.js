import { normalizeImportedProduct } from '../domain.js';

const normalizeHeader = (header) => String(header).toLowerCase().replace(/[^a-z0-9]+/g, '');

const applyColumnMapping = (record, columnMapping) => {
  if (!columnMapping || typeof columnMapping !== 'object') return record;
  const valuesByHeader = Object.fromEntries(
    Object.entries(record).map(([header, value]) => [normalizeHeader(header), value])
  );
  const mapped = { ...record };
  Object.entries(columnMapping).forEach(([field, sourceHeader]) => {
    const sourceKey = normalizeHeader(sourceHeader);
    if (sourceKey && Object.prototype.hasOwnProperty.call(valuesByHeader, sourceKey)) {
      mapped[field] = valuesByHeader[sourceKey];
    }
  });
  return mapped;
};

export const parseDelimited = (text, delimiter = ',') => {
  const rows = [];
  let current = [];
  let value = '';
  let inQuotes = false;
  const chars = String(text).replace(/^\uFEFF/, '').split('');

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === '"') {
      if (inQuotes && chars[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      current.push(value.trim());
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && chars[index + 1] === '\n') index += 1;
      current.push(value.trim());
      if (current.some((entry) => entry !== '')) rows.push(current);
      current = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (inQuotes) throw new Error('A quoted field was not closed.');
  current.push(value.trim());
  if (current.some((entry) => entry !== '')) rows.push(current);
  return rows;
};

export const parseProductImportText = (text, extension, defaultUnit = 'units', columnMapping = {}) => {
  let rows;
  let headers = [];

  if (extension === 'json') {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : [];
    headers = Object.keys(rows[0] || {});
  } else {
    const delimiter = extension === 'tsv' ? '\t' : ',';
    const parsedRows = parseDelimited(text, delimiter);
    if (parsedRows.length < 2) {
      throw new Error('A header row and at least one product row are required.');
    }
    headers = parsedRows[0].map((header) => header.trim());
    const normalizedHeaders = headers.map(normalizeHeader);
    rows = parsedRows.slice(1).map((row) => Object.fromEntries(
      normalizedHeaders.map((header, index) => [header, row[index] ?? ''])
    ));
  }

  const products = [];
  const errors = [];
  const seenSkus = new Set();
  rows.forEach((record, index) => {
    const product = normalizeImportedProduct(applyColumnMapping(record, columnMapping), defaultUnit);
    if (!product) {
      const name = String(record?.name || record?.product || record?.productname || '').trim();
      const sku = String(record?.sku || record?.code || record?.itemcode || '').trim();
      const issue = !name
        ? 'Product name is required.'
        : !sku
          ? 'SKU is required.'
          : 'Quantity, price, or reorder point must be a valid non-negative number.';
      errors.push({ row: index + (extension === 'json' ? 1 : 2), issue });
      return;
    }

    if (seenSkus.has(product.sku)) {
      errors.push({ row: index + (extension === 'json' ? 1 : 2), issue: `Duplicate SKU "${product.sku}" in import.` });
      return;
    }

    seenSkus.add(product.sku);
    products.push({
      ...product,
      sourceRow: index + (extension === 'json' ? 1 : 2),
    });
  });

  return { products, skipped: errors.length, errors, headers };
};
