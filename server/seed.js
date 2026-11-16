'use strict';
const bcrypt = require('bcryptjs');
const db = require('./db');

const DEFAULT_EMAIL = 'admin@avanzar.local';
const DEFAULT_PASS = 'Admin2026!';

async function seed() {
  const email = (process.env.ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || DEFAULT_PASS;
  const existe = await db.query('SELECT id FROM usuarios WHERE email=$1', [email]);
  if (existe.rowCount) return { creado: false, email };
  const hash = await bcrypt.hash(pass, 10);
  await db.query(
    `INSERT INTO usuarios (nombre,email,password_hash,rol,cargo) VALUES ($1,$2,$3,'admin','coordinadora')
     ON CONFLICT (email) DO NOTHING`,
    ['Administrador', email, hash]);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(`[seed] Administrador creado con la clave por defecto (${DEFAULT_PASS}). CÁMBIELA tras el primer ingreso.`);
  }
  return { creado: true, email };
}

module.exports = { seed };

if (require.main === module) {
  seed().then((r) => { console.log('Seed:', r); return db.cerrar(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
