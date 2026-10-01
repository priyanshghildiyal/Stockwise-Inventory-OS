export const normalizeWarehouseProfile = (profile = {}, fallbackName = '') => {
  const name = String(profile.name || fallbackName).trim();
  const capacity = Number(profile.capacity);
  const bins = Array.isArray(profile.bins)
    ? profile.bins.map((bin) => String(bin).trim()).filter(Boolean)
    : String(profile.bins || '').split(',').map((bin) => bin.trim()).filter(Boolean);

  return {
    name,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
    bins: [...new Set(bins)],
  };
};

export const getWarehouseCapacityStatus = (usedUnits, capacity) => {
  const used = Math.max(Number(usedUnits) || 0, 0);
  const limit = Number(capacity);
  if (!Number.isFinite(limit) || limit <= 0) return { used, capacity: null, percent: null, status: 'Unmetered' };
  const percent = (used / limit) * 100;
  return {
    used,
    capacity: limit,
    percent,
    status: percent >= 100 ? 'Full' : percent >= 85 ? 'Near capacity' : 'Available',
  };
};

export const validateWarehouseCapacity = (usedUnits, capacity) => {
  const status = getWarehouseCapacityStatus(usedUnits, capacity);
  return status.capacity !== null && status.used > status.capacity
    ? `Warehouse capacity exceeded by ${status.used - status.capacity} units.`
    : null;
};
