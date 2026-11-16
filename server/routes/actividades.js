'use strict';
const express = require('express');
const db = require('../db');
const { requerirAuth, requerirAdmin } = require('../auth');
const { parseFecha } = require('../tiempo');
const recurrence = require('../services/recurrence');
const gcal = require('../services/gcal');
const { ah, HttpError, bad, entero, rango } = require('./util');

const r = express.Router();
r.use(requerirAuth);

const FRECUENCIAS = Object.keys(recurrence.CANTIDAD);
const esAdmin = (req) => req.usuario.rol === 'admin';

async function cargar(req, id) {
  const q = await db.query(
    `SELECT a.*, u.nombre AS responsable_nombre FROM actividades a JOIN usuarios u ON u.id=a.responsable_id WHERE a.id=$1`, [id]);
  const a = q.rows[0];
  if (!a) throw new HttpError(404, 'Actividad no encontrada');
  if (!esAdmin(req) && a.responsable_id !== req.usuario.id) throw new HttpError(403, 'No autorizado');
  return a;
}

async function validarResponsable(req, valor, actual) {
  if (!esAdmin(req)) return req.usuario.id;
  const id = valor !== undefined && valor !== null && valor !== '' ? entero(valor) : actual ?? req.usuario.id;
  if (!id) throw bad('Responsable inválido');
  const q = await db.query('SELECT activo FROM usuarios WHERE id=$1', [id]);
  if (!q.rowCount) throw bad('El responsable no existe');
  if (!q.rows[0].activo) throw bad('El responsable está inactivo');
  return id;
}

function leerFechaFin(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(v))) throw bad('fecha_fin inválida (use YYYY-MM-DD)');
  return String(v).slice(0, 10);
}

r.get('/', ah(async (req, res) => {
  const { desde, hasta } = rango(req.query);
  const cond = [], p = [];
  if (!esAdmin(req)) { p.push(req.usuario.id); cond.push(`a.responsable_id=$${p.length}`); }
  else if (req.query.responsable) {
    const rid = entero(req.query.responsable); if (!rid) throw bad('Responsable inválido');
    p.push(rid); cond.push(`a.responsable_id=$${p.length}`);
  }
  const sub = [];
  if (desde) { p.push(desde); sub.push(`o.vence_en >= $${p.length}`); }
  if (hasta) { p.push(hasta); sub.push(`o.vence_en < $${p.length}`); }
  if (req.query.estado) {
    if (!['pendiente', 'cumplida'].includes(req.query.estado)) throw bad('Estado inválido');
    p.push(req.query.estado); sub.push(`o.estado=$${p.length}`);
  }
  if (sub.length) cond.push(`EXISTS (SELECT 1 FROM ocurrencias o WHERE o.actividad_id=a.id AND ${sub.join(' AND ')})`);
  const q = await db.query(
    `SELECT a.*, u.nombre AS responsable_nombre,
            (SELECT count(*) FROM ocurrencias o WHERE o.actividad_id=a.id AND o.estado='pendiente')::int AS pendientes,
            (SELECT min(vence_en) FROM ocurrencias o WHERE o.actividad_id=a.id AND o.estado='pendiente') AS proxima_vence_en
       FROM actividades a JOIN usuarios u ON u.id=a.responsable_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY a.fecha_inicio DESC, a.id DESC`, p);
  res.json({ actividades: q.rows });
}));

r.get('/:id', ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  const a = await cargar(req, id);
  const o = await db.query(
    `SELECT id, actividad_id, vence_en, estado, cumplida_en, cumplida_por, comentario, (evidencia IS NOT NULL) AS tiene_evidencia
       FROM ocurrencias WHERE actividad_id=$1 ORDER BY vence_en`, [id]);
  res.json({ actividad: a, ocurrencias: o.rows });
}));

r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const titulo = String(b.titulo || '').trim();
  if (!titulo) throw bad('El título es obligatorio');
  const frecuencia = b.frecuencia || 'unica';
  if (!FRECUENCIAS.includes(frecuencia)) throw bad('Frecuencia inválida');
  const inicio = parseFecha(b.fecha_inicio);
  if (!inicio) throw bad('fecha_inicio es obligatoria y debe ser una fecha válida');
  const fin = leerFechaFin(b.fecha_fin) ?? null;
  const responsable = await validarResponsable(req, b.responsable_id);
  const client = await db.getPool().connect();
  let act;
  try {
    await client.query('BEGIN');
    const q = await client.query(
      `INSERT INTO actividades (titulo,descripcion,categoria,responsable_id,creado_por,frecuencia,fecha_inicio,fecha_fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [titulo, b.descripcion || null, b.categoria || null, responsable, req.usuario.id, frecuencia, inicio, fin]);
    act = q.rows[0];
    await recurrence.generarInicial(client, act);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  const evId = await gcal.crearEvento(act);
  if (evId) { await db.query('UPDATE actividades SET gcal_event_id=$1 WHERE id=$2', [evId, act.id]); act.gcal_event_id = evId; }
  const n = await db.query('SELECT count(*)::int AS n FROM ocurrencias WHERE actividad_id=$1', [act.id]);
  res.status(201).json({ actividad: act, ocurrencias_generadas: n.rows[0].n });
}));

r.put('/:id', ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  const cur = await cargar(req, id);
  const b = req.body || {};
  const titulo = b.titulo !== undefined ? String(b.titulo).trim() : cur.titulo;
  if (!titulo) throw bad('El título es obligatorio');
  const frecuencia = b.frecuencia ?? cur.frecuencia;
  if (!FRECUENCIAS.includes(frecuencia)) throw bad('Frecuencia inválida');
  let inicio = new Date(cur.fecha_inicio);
  if (b.fecha_inicio !== undefined) { inicio = parseFecha(b.fecha_inicio); if (!inicio) throw bad('fecha_inicio inválida'); }
  const fin = b.fecha_fin !== undefined ? leerFechaFin(b.fecha_fin) : cur.fecha_fin;
  const responsable = esAdmin(req) ? await validarResponsable(req, b.responsable_id, cur.responsable_id) : cur.responsable_id;
  const activa = b.activa !== undefined ? !!b.activa : cur.activa;
  const regen = frecuencia !== cur.frecuencia || inicio.getTime() !== new Date(cur.fecha_inicio).getTime() || (fin ?? null) !== (cur.fecha_fin ?? null);
  const client = await db.getPool().connect();
  let act;
  try {
    await client.query('BEGIN');
    const q = await client.query(
      `UPDATE actividades SET titulo=$1,descripcion=$2,categoria=$3,responsable_id=$4,frecuencia=$5,fecha_inicio=$6,fecha_fin=$7,
              activa=$8,actualizado_en=now() WHERE id=$9 RETURNING *`,
      [titulo, b.descripcion !== undefined ? b.descripcion : cur.descripcion, b.categoria !== undefined ? b.categoria : cur.categoria,
       responsable, frecuencia, inicio, fin, activa, id]);
    act = q.rows[0];
    if (regen) await recurrence.regenerar(client, act);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  const evId = await gcal.actualizarEvento(act);
  if (evId && evId !== act.gcal_event_id) { await db.query('UPDATE actividades SET gcal_event_id=$1 WHERE id=$2', [evId, id]); act.gcal_event_id = evId; }
  res.json({ actividad: act });
}));

r.delete('/:id', requerirAdmin, ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  const a = (await db.query('SELECT * FROM actividades WHERE id=$1', [id])).rows[0];
  if (!a) throw new HttpError(404, 'Actividad no encontrada');
  await gcal.borrarEvento(a);
  await db.query('DELETE FROM actividades WHERE id=$1', [id]);
  res.json({ ok: true });
}));

module.exports = r;
