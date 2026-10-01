import { createApp } from './app.js';
import { config } from './config.js';

if (config.isProduction && !config.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured before starting production.');
}

const app = createApp();
app.listen(config.PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'Stockwise API listening', port: config.PORT, environment: config.NODE_ENV }));
});
