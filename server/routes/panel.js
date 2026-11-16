'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requerirAuth } = require('../auth');
const alerts = require('../services/alerts');
const { aLocal, deLocal } = require('../tiempo');
const { ah, bad, entero } = require('./util');

const r = express.Router();

r.get('/salud', (req, res) => res.json({ ok: true }));

r.get('/resumen', requerirAuth, ah(async (req, res) => {
  const ahora = new Date();
  const l = aLocal(ahora);
  const inicioMes = deLocal(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1)));
  const finMes = deLocal(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 1)));
  const admin = req.usuario.rol === 'admin';
  const filtro = admin ? '' : 'AND a.responsable_id=$4';
  const p = [ahora, inicioMes, finMes]; if (!admin) p.push(req.usuario.id);
  const q = await db.query(
    `SELECT
       count(*) FILTER (WHERE o.estado='pendiente' AND o.vence_en >= $1)::int AS pendientes,
       count(*) FILTER (WHERE o.estado='pendiente' AND o.vence_en < $1)::int AS vencidas,
       count(*) FILTER (WHERE o.estado='cumplida' AND o.cumplida_en >= $2 AND o.cumplida_en < $3)::int AS cumplidas_mes
     FROM ocurrencias o JOIN actividades a ON a.id=o.actividad_id WHERE a.activa ${filtro}`, p);
  const pp = [ahora]; if (!admin) pp.push(req.usuario.id);
  const prox = await db.query(
    `SELECT o.id, o.actividad_id, o.vence_en, a.titulo, a.categoria, u.nombre AS responsable_nombre
       FROM ocurrencias o JOIN actividades a ON a.id=o.actividad_id JOIN usuarios u ON u.id=a.responsable_id
      WHERE a.activa AND o.estado='pendiente' AND o.vence_en >= $1 ${admin ? '' : 'AND a.responsable_id=$2'}
      ORDER BY o.vence_en LIMIT 10`, pp);
  res.json({ ...q.rows[0], proximas: prox.rows });
}));

r.get('/alertas', requerirAuth, ah(async (req, res) => {
  const cond = [], p = [];
  if (req.usuario.rol !== 'admin') { p.push(req.usuario.id); cond.push(`a.responsable_id=$${p.length}`); }
  if (req.query.ocurrencia_id) {
    const id = entero(req.query.ocurrencia_id); if (!id) throw bad('ocurrencia_id inválido');
    p.push(id); cond.push(`l.ocurrencia_id=$${p.length}`);
  }
  const q = await db.query(
    `SELECT l.*, a.titulo FROM alertas_log l JOIN ocurrencias o ON o.id=l.ocurrencia_id JOIN actividades a ON a.id=o.actividad_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY l.enviado_en DESC, l.id DESC LIMIT 500`, p);
  res.json({ alertas: q.rows });
}));

// Disparador externo (p. ej. cron-job.org) porque el plan gratuito de Render duerme el servicio.
r.get('/cron/tick', ah(async (req, res) => {
  const esperado = process.env.CRON_SECRET;
  const recibido = String(req.headers['x-cron-secret'] || '');
  if (!esperado) return res.status(503).json({ error: 'CRON_SECRET no configurado' });
  const a = Buffer.from(recibido), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'No autorizado' });
  const r2 = await alerts.tick(new Date());
  res.json({ ok: true, enviadas: r2.enviadas?.length ?? 0, omitido: !!r2.omitido });
}));

module.exports = r;
