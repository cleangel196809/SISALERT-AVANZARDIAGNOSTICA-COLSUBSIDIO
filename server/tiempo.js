'use strict';
// Utilidades de tiempo para America/Bogota (UTC-5 fijo, sin horario de verano).
const OFFSET_MS = 5 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

/** Devuelve un Date cuyos getters UTC representan la hora de pared en Bogotá. */
function aLocal(d) { return new Date(new Date(d).getTime() - OFFSET_MS); }
function deLocal(d) { return new Date(d.getTime() + OFFSET_MS); }

/** Instante correspondiente a las 00:00 (Bogotá) del día en que cae `d`. */
function inicioDiaLocal(d) {
  const ms = new Date(d).getTime() - OFFSET_MS;
  return new Date(Math.floor(ms / DIA_MS) * DIA_MS + OFFSET_MS);
}

/** Parsea fecha ISO. Sin zona horaria explícita se interpreta como hora de Bogotá. */
function parseFecha(valor) {
  if (valor instanceof Date) return isNaN(valor) ? null : valor;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  let s = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00-05:00';
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + '-05:00';
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** 'YYYY-MM-DD' (fecha local Bogotá) de un instante. */
function fechaLocalISO(d) { return aLocal(d).toISOString().slice(0, 10); }

function formatoLargo(d) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full', timeStyle: 'short' }).format(new Date(d));
}

module.exports = { OFFSET_MS, DIA_MS, aLocal, deLocal, inicioDiaLocal, parseFecha, fechaLocalISO, formatoLargo };
