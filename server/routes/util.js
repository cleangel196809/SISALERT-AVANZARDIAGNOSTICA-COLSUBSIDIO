'use strict';
const { parseFecha, inicioDiaLocal } = require('../tiempo');

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

function entero(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Rango [desde, hasta) a partir de query. Fechas sin hora: hasta incluye todo el día. */
function rango(q) {
  const out = {};
  if (q.desde) {
    const d = parseFecha(String(q.desde));
    if (!d) throw bad('Parámetro "desde" inválido');
    out.desde = d;
  }
  if (q.hasta) {
    const s = String(q.hasta);
    const d = parseFecha(s);
    if (!d) throw bad('Parámetro "hasta" inválido');
    out.hasta = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(inicioDiaLocal(d).getTime() + 86400000) : d;
  }
  return out;
}

const soloDigitos = (v) => (v == null || v === '' ? null : String(v).replace(/\D/g, '') || null);

module.exports = { ah, HttpError, bad, entero, rango, soloDigitos };
