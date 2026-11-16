'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requerirAuth, requerirAdmin, COLUMNAS_PUBLICAS } = require('../auth');
const { enviarCorreo, plantillaAlerta } = require('../services/mailer');
const { enviarWhatsapp } = require('../services/whatsapp');
const { ah, HttpError, bad, entero, soloDigitos } = require('./util');

const r = express.Router();
r.use(requerirAuth);

const ROLES = ['admin', 'usuario'];
const CARGOS = ['bacteriologa', 'auxiliar', 'coordinadora', 'otro'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

r.get('/', ah(async (req, res) => {
  if (req.usuario.rol === 'admin') {
    const q = await db.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios ORDER BY nombre`);
    return res.json({ usuarios: q.rows });
  }
  const q = await db.query('SELECT id,nombre,cargo FROM usuarios WHERE activo ORDER BY nombre');
  res.json({ usuarios: q.rows });
}));

// Debe ir antes de /:id
r.put('/yo', ah(async (req, res) => {
  const { nombre, whatsapp, callmebot_apikey } = req.body || {};
  const cur = req.usuario;
  const n = nombre !== undefined ? String(nombre).trim() : cur.nombre;
  if (!n) throw bad('El nombre no puede estar vacío');
  const w = whatsapp !== undefined ? soloDigitos(whatsapp) : cur.whatsapp;
  const k = callmebot_apikey !== undefined ? (String(callmebot_apikey).trim() || null) : cur.callmebot_apikey;
  const q = await db.query(
    `UPDATE usuarios SET nombre=$1, whatsapp=$2, callmebot_apikey=$3 WHERE id=$4 RETURNING ${COLUMNAS_PUBLICAS}`,
    [n, w, k, cur.id]);
  res.json({ usuario: q.rows[0] });
}));

r.get('/:id', ah(async (req, res) => {
  const id = entero(req.params.id);
  if (!id) throw bad('Id inválido');
  if (req.usuario.rol !== 'admin' && req.usuario.id !== id) throw new HttpError(403, 'No autorizado');
  const q = await db.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id=$1`, [id]);
  if (!q.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  res.json({ usuario: q.rows[0] });
}));

r.post('/', requerirAdmin, ah(async (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  if (!nombre) throw bad('El nombre es obligatorio');
  if (!EMAIL_RE.test(email)) throw bad('Correo inválido');
  if (!b.password || String(b.password).length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
  const rol = b.rol || 'usuario';
  const cargo = b.cargo || 'otro';
  if (!ROLES.includes(rol)) throw bad('Rol inválido');
  if (!CARGOS.includes(cargo)) throw bad('Cargo inválido');
  const hash = await bcrypt.hash(String(b.password), 10);
  try {
    const q = await db.query(
      `INSERT INTO usuarios (nombre,email,password_hash,rol,cargo,whatsapp,callmebot_apikey,activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLUMNAS_PUBLICAS}`,
      [nombre, email, hash, rol, cargo, soloDigitos(b.whatsapp), b.callmebot_apikey ? String(b.callmebot_apikey).trim() : null, b.activo !== false]);
    res.status(201).json({ usuario: q.rows[0] });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Ya existe un usuario con ese correo');
    throw e;
  }
}));

r.put('/:id', requerirAdmin, ah(async (req, res) => {
  const id = entero(req.params.id);
  if (!id) throw bad('Id inválido');
  const cur = (await db.query('SELECT * FROM usuarios WHERE id=$1', [id])).rows[0];
  if (!cur) throw new HttpError(404, 'Usuario no encontrado');
  const b = req.body || {};
  const nombre = b.nombre !== undefined ? String(b.nombre).trim() : cur.nombre;
  const email = b.email !== undefined ? String(b.email).trim().toLowerCase() : cur.email;
  const rol = b.rol ?? cur.rol;
  const cargo = b.cargo ?? cur.cargo;
  const activo = b.activo !== undefined ? !!b.activo : cur.activo;
  if (!nombre) throw bad('El nombre es obligatorio');
  if (!EMAIL_RE.test(email)) throw bad('Correo inválido');
  if (!ROLES.includes(rol)) throw bad('Rol inválido');
  if (!CARGOS.includes(cargo)) throw bad('Cargo inválido');
  if (id === req.usuario.id && (rol !== 'admin' || !activo)) throw bad('No puede quitarse a sí mismo el rol de administrador ni desactivarse');
  let hash = cur.password_hash;
  if (b.password) {
    if (String(b.password).length < 8) throw bad('La contraseña debe tener al menos 8 caracteres');
    hash = await bcrypt.hash(String(b.password), 10);
  }
  const whatsapp = b.whatsapp !== undefined ? soloDigitos(b.whatsapp) : cur.whatsapp;
  const apikey = b.callmebot_apikey !== undefined ? (String(b.callmebot_apikey).trim() || null) : cur.callmebot_apikey;
  try {
    const q = await db.query(
      `UPDATE usuarios SET nombre=$1,email=$2,password_hash=$3,rol=$4,cargo=$5,whatsapp=$6,callmebot_apikey=$7,activo=$8
       WHERE id=$9 RETURNING ${COLUMNAS_PUBLICAS}`,
      [nombre, email, hash, rol, cargo, whatsapp, apikey, activo, id]);
    res.json({ usuario: q.rows[0] });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Ya existe un usuario con ese correo');
    throw e;
  }
}));

r.delete('/:id', requerirAdmin, ah(async (req, res) => {
  const id = entero(req.params.id);
  if (!id) throw bad('Id inválido');
  if (id === req.usuario.id) throw bad('No puede eliminar su propio usuario');
  try {
    const q = await db.query('DELETE FROM usuarios WHERE id=$1', [id]);
    if (!q.rowCount) throw new HttpError(404, 'Usuario no encontrado');
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') throw new HttpError(409, 'El usuario tiene actividades asignadas; reasígnelas o desactívelo');
    throw e;
  }
}));

r.post('/:id/probar-alerta', requerirAdmin, ah(async (req, res) => {
  const id = entero(req.params.id);
  if (!id) throw bad('Id inválido');
  const u = (await db.query('SELECT * FROM usuarios WHERE id=$1', [id])).rows[0];
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  const p = plantillaAlerta({ tipo: 'prueba', titulo: 'Alerta de prueba', venceEn: new Date(), ocurrenciaId: 0, nombre: u.nombre, usuarioId: u.id });
  const correo = await enviarCorreo({ to: u.email, subject: '[SISALERT] Mensaje de prueba', html: p.html, text: p.text });
  const wa = await enviarWhatsapp({ phone: u.whatsapp, apikey: u.callmebot_apikey, text: 'SISALERT - Mensaje de prueba. Si lo recibe, las alertas por WhatsApp funcionan. Las alertas reales traen tres enlaces: Cumplido, Pendiente y Notas.' });
  res.json({ correo, whatsapp: wa });
}));

module.exports = r;
