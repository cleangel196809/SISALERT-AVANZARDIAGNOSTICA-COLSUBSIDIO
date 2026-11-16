'use strict';
const { aLocal, deLocal, fechaLocalISO } = require('../tiempo');

// Ocurrencias generadas por adelantado al crear/editar.
const CANTIDAD = { unica: 1, semanal: 26, mensual: 12, trimestral: 8, semestral: 4, anual: 3 };
const MESES = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
const PERIODO_DIAS = { semanal: 7 };

/** Instante de la ocurrencia k-ésima (k=0 es el inicio), sin deriva de día en los meses. */
function ocurrenciaK(inicio, frecuencia, k) {
  if (frecuencia === 'unica') return new Date(inicio);
  const l = aLocal(inicio);
  if (PERIODO_DIAS[frecuencia]) {
    return new Date(inicio.getTime() + k * PERIODO_DIAS[frecuencia] * 86400000);
  }
  const meses = MESES[frecuencia] * k;
  const total = l.getUTCFullYear() * 12 + l.getUTCMonth() + meses;
  const y = Math.floor(total / 12), m = total % 12;
  const diasMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(l.getUTCDate(), diasMes);
  return deLocal(new Date(Date.UTC(y, m, d, l.getUTCHours(), l.getUTCMinutes(), l.getUTCSeconds())));
}

/**
 * Genera las fechas de vencimiento.
 * opciones: { fechaFin: 'YYYY-MM-DD'|null, hasta: Date (límite superior opcional), cantidad: n (opcional) }
 */
function generarFechas(inicio, frecuencia, opciones = {}) {
  if (!(frecuencia in CANTIDAD)) throw new Error('Frecuencia inválida');
  const max = opciones.cantidad ?? CANTIDAD[frecuencia];
  const out = [];
  for (let k = 0; k < max; k++) {
    const f = ocurrenciaK(inicio, frecuencia, k);
    if (opciones.fechaFin && fechaLocalISO(f) > opciones.fechaFin) break;
    if (opciones.hasta && f > opciones.hasta) break;
    out.push(f);
    if (frecuencia === 'unica') break;
  }
  return out;
}

/** Inserta ocurrencias ignorando duplicados. `cliente` puede ser pool o client. */
async function insertar(cliente, actividadId, fechas) {
  for (const f of fechas) {
    await cliente.query(
      'INSERT INTO ocurrencias (actividad_id, vence_en) VALUES ($1,$2) ON CONFLICT (actividad_id, vence_en) DO NOTHING',
      [actividadId, f]);
  }
}

/** Generación inicial al crear la actividad. */
async function generarInicial(cliente, act) {
  const fechas = generarFechas(new Date(act.fecha_inicio), act.frecuencia, { fechaFin: act.fecha_fin });
  await insertar(cliente, act.id, fechas);
  return fechas.length;
}

/**
 * Regenera tras editar: borra pendientes futuras (y la pendiente de una 'unica')
 * y vuelve a generar. Nunca toca ocurrencias cumplidas.
 */
async function regenerar(cliente, act, ahora = new Date()) {
  if (act.frecuencia === 'unica') {
    await cliente.query(`DELETE FROM ocurrencias WHERE actividad_id=$1 AND estado='pendiente'`, [act.id]);
  } else {
    await cliente.query(`DELETE FROM ocurrencias WHERE actividad_id=$1 AND estado='pendiente' AND vence_en >= $2`, [act.id, ahora]);
  }
  let fechas = generarFechas(new Date(act.fecha_inicio), act.frecuencia, { fechaFin: act.fecha_fin });
  if (act.frecuencia !== 'unica') fechas = fechas.filter((f) => f >= ahora);
  await insertar(cliente, act.id, fechas);
  return fechas.length;
}

/** Job diario: extiende el horizonte de actividades recurrentes activas. */
async function extenderHorizonte(db, ahora = new Date()) {
  const r = await db.query(`SELECT id, frecuencia, fecha_inicio, fecha_fin FROM actividades WHERE activa AND frecuencia <> 'unica'`);
  let nuevas = 0;
  for (const a of r.rows) {
    const n = CANTIDAD[a.frecuencia];
    const hasta = ocurrenciaK(ahora, a.frecuencia, n);
    const fechas = generarFechas(new Date(a.fecha_inicio), a.frecuencia, { fechaFin: a.fecha_fin, hasta, cantidad: 100000 })
      .filter((f) => f >= ahora);
    for (const f of fechas) {
      const ins = await db.query(
        'INSERT INTO ocurrencias (actividad_id, vence_en) VALUES ($1,$2) ON CONFLICT (actividad_id, vence_en) DO NOTHING', [a.id, f]);
      nuevas += ins.rowCount;
    }
  }
  return nuevas;
}

module.exports = { CANTIDAD, ocurrenciaK, generarFechas, generarInicial, regenerar, extenderHorizonte };
