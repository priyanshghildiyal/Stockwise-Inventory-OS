export const sanitizeStoredArray = (value, fallback, detector = () => false) => {
  if (!Array.isArray(value)) return fallback;
  return value.filter((entry) => !detector(entry));
};