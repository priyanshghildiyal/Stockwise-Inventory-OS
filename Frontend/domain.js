export const applyInventoryOperation = (stockByLocation, { type, quantity, location, destination }) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0 || (type !== 'Adjustment' && qty === 0)) {
    return { stock: stockByLocation, error: 'Enter a valid non-negative quantity.' };
  }
  if (!location) return { stock: stockByLocation, error: 'Choose a valid source location.' };
  if (type === 'Internal' && (!destination || destination === location)) {
    return { stock: stockByLocation, error: 'Choose a different destination for an internal transfer.' };
  }
  if (!['Receipt', 'Delivery', 'Internal', 'Adjustment'].includes(type)) {
    return { stock: stockByLocation, error: 'Choose a valid inventory operation.' };
  }

  const nextStock = { ...(stockByLocation || {}) };
  const sourceQty = Number(nextStock[location]) || 0;
  if ((type === 'Delivery' || type === 'Internal') && sourceQty < qty) {
    return { stock: stockByLocation, error: 'Not enough stock in the selected source location.' };
  }

  if (type === 'Receipt') nextStock[location] = sourceQty + qty;
  if (type === 'Delivery') nextStock[location] = sourceQty - qty;
  if (type === 'Internal') {
    nextStock[location] = sourceQty - qty;
    nextStock[destination] = (Number(nextStock[destination]) || 0) + qty;
  }
  if (type === 'Adjustment') nextStock[location] = qty;
  return { stock: nextStock, error: null };
};

export const renameWarehouseInOperation = (operation, currentName, nextName) => ({
  ...operation,
  location: operation.location === currentName ? nextName : operation.location,
  partner: operation.type === 'Internal'
    ? String(operation.partner || '').split(' → ').map((location) => location === currentName ? nextName : location).join(' → ')
    : operation.partner,
});

export { getShipmentBlockReason } from './services/orders.js';
export { getInvoiceOutstanding } from './services/billing.js';

export const normalizeImportedProduct = (record, defaultUnit = 'units') => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const name = String(record.name || record.product || record.productname || '').trim();
  const sku = String(record.sku || record.code || record.itemcode || '').trim().toUpperCase();
  const quantity = Number(record.quantity || record.qty || record.stock || record.onhand || 0);
  const price = Number(record.price || record.unitprice || 0);
  const reorder = Number(record.reorder || record.reorderpoint || record.minimumstock || 0);
  if (!name || !sku || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(reorder) || reorder < 0) return null;

  return {
    name,
    sku,
    barcode: String(record.barcode || record.gtin || record.ean || '').trim(),
    description: String(record.description || record.details || '').trim(),
    material: String(record.material || record.composition || '').trim(),
    supplierName: String(record.suppliername || record.supplierName || record.preferredsupplier || record.preferredSupplier || record.supplier || record.vendorname || record.vendorName || record.vendor || '').trim(),
    category: String(record.category || 'Other').trim() || 'Other',
    unit: String(record.unit || record.uom || defaultUnit).trim() || defaultUnit,
    quantity,
    price,
    reorder,
  };
};
