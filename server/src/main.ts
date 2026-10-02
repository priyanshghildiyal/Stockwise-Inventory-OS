import { createApp } from './app.js';
import { config } from './config.js';

if (config.isProduction && !config.useDatabase) {
  throw new Error('Production requires USE_DATABASE=true with a valid DATABASE_URL.');
}

const app = createApp();
app.listen(config.PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', message: 'Stockwise API listening', port: config.PORT, environment: config.NODE_ENV }));
});
