'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requerirAuth, requerirAdmin } = require('../auth');
const { parseFecha } = require('../tiempo');
const { ah, HttpError, bad, entero, rango } = require('./util');

const r = express.Router();
r.use(requerirAuth);

const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'Formato de imagen no permitido (use jpg, png, webp o heic)'));
  },
});

const esAdmin = (req) => req.usuario.rol === 'admin';
const COLS = `o.id, o.actividad_id, o.vence_en, o.estado, o.cumplida_en, o.cumplida_por, o.comentario, o.evidencia_mime,
  (o.evidencia IS NOT NULL) AS tiene_evidencia, a.titulo, a.descripcion, a.categoria, a.frecuencia, a.responsable_id,
  u.nombre AS responsable_nombre`;
const FROM = `FROM ocurrencias o JOIN actividades a ON a.id=o.actividad_id JOIN usuarios u ON u.id=a.responsable_id`;

async function cargar(req, id) {
  const q = await db.query(`SELECT ${COLS} ${FROM} WHERE o.id=$1`, [id]);
  const o = q.rows[0];
  if (!o) throw new HttpError(404, 'Ocurrencia no encontrada');
  if (!esAdmin(req) && o.responsable_id !== req.usuario.id) throw new HttpError(403, 'No autorizado');
  return o;
}

r.get('/', ah(async (req, res) => {
  const { desde, hasta } = rango(req.query);
  const cond = [], p = [];
  if (!esAdmin(req)) { p.push(req.usuario.id); cond.push(`a.responsable_id=$${p.length}`); }
  else if (req.query.responsable) {
    const rid = entero(req.query.responsable); if (!rid) throw bad('Responsable inválido');
    p.push(rid); cond.push(`a.responsable_id=$${p.length}`);
  }
  if (desde) { p.push(desde); cond.push(`o.vence_en >= $${p.length}`); }
  if (hasta) { p.push(hasta); cond.push(`o.vence_en < $${p.length}`); }
  if (req.query.estado) {
    if (!['pendiente', 'cumplida'].includes(req.query.estado)) throw bad('Estado inválido');
    p.push(req.query.estado); cond.push(`o.estado=$${p.length}`);
  }
  const q = await db.query(
    `SELECT ${COLS} ${FROM} ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY o.vence_en LIMIT 2000`, p);
  res.json({ ocurrencias: q.rows });
}));

r.get('/:id', ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  res.json({ ocurrencia: await cargar(req, id) });
}));

r.post('/:id/cumplir', (req, res, next) => {
  upload.single('evidencia')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'La imagen supera el máximo de 6 MB'));
    if (err instanceof multer.MulterError) return next(new HttpError(400, 'Error al procesar el archivo: ' + err.message));
    next(err);
  });
}, ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  const o = await cargar(req, id);
  if (!req.file || !req.file.buffer?.length) throw bad('Debe adjuntar una foto de evidencia (campo "evidencia")');
  if (o.estado === 'cumplida') throw new HttpError(409, 'La actividad ya fue marcada como realizada');
  const comentario = req.body?.comentario ? String(req.body.comentario).slice(0, 2000) : null;
  const q = await db.query(
    `UPDATE ocurrencias SET estado='cumplida', cumplida_en=now(), cumplida_por=$1, comentario=COALESCE($2, comentario),
            evidencia=$3, evidencia_mime=$4 WHERE id=$5 AND estado='pendiente'`,
    [req.usuario.id, comentario, req.file.buffer, req.file.mimetype, id]);
  if (!q.rowCount) throw new HttpError(409, 'La actividad ya fue marcada como realizada');
  res.json({ ocurrencia: await cargar(req, id) });
}));

r.get('/:id/evidencia', ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  await cargar(req, id);
  const q = await db.query('SELECT evidencia, evidencia_mime FROM ocurrencias WHERE id=$1', [id]);
  const e = q.rows[0];
  if (!e?.evidencia) throw new HttpError(404, 'Sin evidencia');
  res.set('Content-Type', e.evidencia_mime || 'application/octet-stream');
  res.set('Cache-Control', 'private, max-age=300');
  res.send(e.evidencia);
}));

r.put('/:id', ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  const o = await cargar(req, id);
  const b = req.body || {};
  let vence = new Date(o.vence_en);
  let cambioFecha = false;
  if (b.vence_en !== undefined) {
    if (o.estado === 'cumplida') throw bad('No se puede reprogramar una ocurrencia cumplida');
    const d = parseFecha(b.vence_en);
    if (!d) throw bad('vence_en inválido');
    cambioFecha = d.getTime() !== vence.getTime();
    vence = d;
  }
  const comentario = b.comentario !== undefined ? (b.comentario === null ? null : String(b.comentario).slice(0, 2000)) : o.comentario;
  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE ocurrencias SET vence_en=$1, comentario=$2 WHERE id=$3', [vence, comentario, id]);
    // Al reprogramar, el ciclo de alertas empieza de nuevo.
    if (cambioFecha) await client.query('DELETE FROM alertas_log WHERE ocurrencia_id=$1', [id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') throw new HttpError(409, 'Ya existe una ocurrencia de esa actividad en esa fecha');
    throw e;
  } finally { client.release(); }
  res.json({ ocurrencia: await cargar(req, id) });
}));

r.delete('/:id', requerirAdmin, ah(async (req, res) => {
  const id = entero(req.params.id); if (!id) throw bad('Id inválido');
  const q = await db.query('DELETE FROM ocurrencias WHERE id=$1', [id]);
  if (!q.rowCount) throw new HttpError(404, 'Ocurrencia no encontrada');
  res.json({ ok: true });
}));

module.exports = r;
