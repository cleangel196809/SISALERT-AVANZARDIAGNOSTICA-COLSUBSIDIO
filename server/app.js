'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function crearApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.use('/auth', require('./routes/auth'));
  api.use('/usuarios', require('./routes/usuarios'));
  api.use('/actividades', require('./routes/actividades'));
  api.use('/ocurrencias', require('./routes/ocurrencias'));
  api.use('/', require('./routes/panel'));
  api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use('/api', api);

  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res) => {
    const index = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(index)) return res.sendFile(index);
    res.status(404).send('Not found');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
  });
  return app;
}

module.exports = { crearApp };
