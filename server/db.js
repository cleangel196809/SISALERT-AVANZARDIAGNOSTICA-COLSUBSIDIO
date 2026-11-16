'use strict';
const { Pool, types } = require('pg');

// DATE como string 'YYYY-MM-DD' (evita corrimientos por zona horaria).
types.setTypeParser(1082, (v) => v);

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://sisalert:sisalert@localhost:5433/sisalert',
      max: 10,
    });
    pool.on('error', (e) => console.error('[db] error de conexión inactiva:', e.message));
  }
  return pool;
}

const query = (text, params) => getPool().query(text, params);

async function cerrar() {
  if (pool) { const p = pool; pool = null; await p.end(); }
}

module.exports = { getPool, query, cerrar };
