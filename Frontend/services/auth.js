export const validateLoginCredentials = ({ email = '', password = '' } = {}) => {
  const errors = {};
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    errors.email = 'Enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+$/.test(normalizedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password) {
    errors.password = 'Enter your password.';
  } else if (password.length < 8) {
    errors.password = 'Use at least 8 characters.';
  }

  return errors;
};
