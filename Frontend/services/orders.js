export const getShipmentBlockReason = (order, shipments = []) => {
  if (!order) return 'Select a valid sales order for this shipment.';
  if (order.status === 'Shipped' || shipments.some((shipment) => shipment.orderId === order.id)) {
    return 'This order has already been shipped.';
  }
  if (!(Number(order.qty) > 0)) return 'This order has no units to ship.';
  return '';
};

export const deductShipmentStock = (stockByLocation, quantity, location) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0 || !location) {
    return { stock: stockByLocation, error: 'Shipment quantity and location must be valid.' };
  }
  const available = Number(stockByLocation?.[location]) || 0;
  if (available < qty) {
    return { stock: stockByLocation, error: 'Not enough stock in this warehouse to create the shipment.' };
  }
  return {
    stock: { ...(stockByLocation || {}), [location]: available - qty },
    error: null,
  };
};
