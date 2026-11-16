'use strict';
const db = require('./db');

const SQL = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin','usuario')),
  cargo TEXT NOT NULL DEFAULT 'otro' CHECK (cargo IN ('bacteriologa','auxiliar','coordinadora','otro')),
  whatsapp TEXT,
  callmebot_apikey TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS actividades (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  responsable_id INTEGER NOT NULL REFERENCES usuarios(id),
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  frecuencia TEXT NOT NULL DEFAULT 'unica' CHECK (frecuencia IN ('unica','semanal','mensual','trimestral','semestral','anual')),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin DATE,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  gcal_event_id TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ocurrencias (
  id SERIAL PRIMARY KEY,
  actividad_id INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  vence_en TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cumplida')),
  cumplida_en TIMESTAMPTZ,
  cumplida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  comentario TEXT,
  evidencia BYTEA,
  evidencia_mime TEXT,
  UNIQUE (actividad_id, vence_en)
);
CREATE TABLE IF NOT EXISTS alertas_log (
  id SERIAL PRIMARY KEY,
  ocurrencia_id INTEGER NOT NULL REFERENCES ocurrencias(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('d3','d2','d1','dia')),
  canal TEXT NOT NULL CHECK (canal IN ('correo','whatsapp')),
  destino TEXT,
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS idx_ocurrencias_estado_vence ON ocurrencias (estado, vence_en);
CREATE INDEX IF NOT EXISTS idx_alertas_log_ocurrencia ON alertas_log (ocurrencia_id, tipo);
`;

async function migrate() {
  const client = await db.getPool().connect();
  try {
    // Bloqueo consultivo: evita carreras si arrancan varias instancias a la vez.
    await client.query('SELECT pg_advisory_lock(7351001)');
    await client.query(SQL);
    await client.query('SELECT pg_advisory_unlock(7351001)');
  } finally {
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate().then(() => { console.log('Migración completada'); return db.cerrar(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
