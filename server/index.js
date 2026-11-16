'use strict';
process.env.TZ = process.env.TZ || 'America/Bogota';
try { process.loadEnvFile?.(); } catch { /* .env opcional */ }

const cron = require('node-cron');
const db = require('./db');
const { migrate } = require('./migrate');
const { seed } = require('./seed');
const { crearApp } = require('./app');
const alerts = require('./services/alerts');
const recurrence = require('./services/recurrence');

async function main() {
  await migrate();
  await seed();
  const port = Number(process.env.PORT || 3000);
  const server = crearApp().listen(port, () => console.log(`SISALERT escuchando en :${port}`));

  cron.schedule('* * * * *', () => { alerts.tick(new Date()).catch((e) => console.error('[cron tick]', e.message)); },
    { timezone: 'America/Bogota' });
  cron.schedule('15 3 * * *', () => {
    recurrence.extenderHorizonte(db, new Date()).then((n) => console.log(`[cron] horizonte extendido: ${n} ocurrencias`))
      .catch((e) => console.error('[cron horizonte]', e.message));
  }, { timezone: 'America/Bogota' });

  const apagar = () => server.close(() => db.cerrar().finally(() => process.exit(0)));
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}

main().catch((e) => { console.error('Error fatal al iniciar:', e); process.exit(1); });
