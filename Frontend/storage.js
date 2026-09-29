export const STORAGE_VERSION = 1;

const STORAGE_MARKER = '__stockwiseStorage';
export const STORAGE_MIGRATIONS = {};

const getBrowserStorage = (kind) => {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
};

export const migrateStoredValue = (key, value, fromVersion, migrationMap = STORAGE_MIGRATIONS) => {
  let nextValue = value;
  for (let version = fromVersion; version < STORAGE_VERSION; version += 1) {
    const migrate = migrationMap[`${key}:${version}`];
    if (migrate) nextValue = migrate(nextValue);
  }
  return nextValue;
};

export const readStorageValue = (storage, key, fallback) => {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;

    const parsed = JSON.parse(raw);
    const isEnvelope = parsed && typeof parsed === 'object' && parsed[STORAGE_MARKER] === true;
    const storedVersion = isEnvelope ? parsed.version : 0;
    if (!Number.isInteger(storedVersion) || storedVersion < 0 || storedVersion > STORAGE_VERSION) return fallback;

    return migrateStoredValue(key, isEnvelope ? parsed.value : parsed, storedVersion);
  } catch {
    return fallback;
  }
};

export const writeStorageValue = (storage, key, value) => {
  if (!storage) return false;
  try {
    const raw = typeof storage.getItem === 'function' ? storage.getItem(key) : null;
    if (raw !== null) {
      const existing = JSON.parse(raw);
      if (existing?.[STORAGE_MARKER] === true && existing.version > STORAGE_VERSION) return false;
    }
    storage.setItem(key, JSON.stringify({
      [STORAGE_MARKER]: true,
      version: STORAGE_VERSION,
      value,
    }));
    return true;
  } catch {
    return false;
  }
};

export const removeStorageValue = (storage, key) => {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const readLocal = (key, fallback) => readStorageValue(getBrowserStorage('localStorage'), key, fallback);
export const writeLocal = (key, value) => writeStorageValue(getBrowserStorage('localStorage'), key, value);
export const removeLocal = (key) => removeStorageValue(getBrowserStorage('localStorage'), key);
export const readSession = (key, fallback) => readStorageValue(getBrowserStorage('sessionStorage'), key, fallback);
export const writeSession = (key, value) => writeStorageValue(getBrowserStorage('sessionStorage'), key, value);
export const removeSession = (key) => removeStorageValue(getBrowserStorage('sessionStorage'), key);

export const sanitizeStoredArray = (value, fallback, detector = () => false) => {
  if (!Array.isArray(value)) return fallback;
  return value.filter((entry) => !detector(entry));
};
