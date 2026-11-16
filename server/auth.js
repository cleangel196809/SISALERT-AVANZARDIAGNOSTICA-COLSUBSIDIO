'use strict';
const jwt = require('jsonwebtoken');
const db = require('./db');

const COOKIE = 'sisalert_token';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function secreto() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET es obligatorio en producción');
  return 'dev-secret-no-usar-en-produccion';
}

function firmar(usuario) {
  return jwt.sign({ sub: usuario.id }, secreto(), { expiresIn: '7d' });
}

function opcionesCookie() {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: MAX_AGE_MS, path: '/' };
}

function leerCookie(req, nombre) {
  const h = req.headers.cookie;
  if (!h) return null;
  for (const parte of h.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

const COLUMNAS_PUBLICAS = 'id,nombre,email,rol,cargo,whatsapp,callmebot_apikey,activo,creado_en';

async function requerirAuth(req, res, next) {
  try {
    const token = leerCookie(req, COOKIE);
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    let payload;
    try { payload = jwt.verify(token, secreto()); } catch { return res.status(401).json({ error: 'Sesión inválida o expirada' }); }
    const r = await db.query(`SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id=$1`, [payload.sub]);
    const u = r.rows[0];
    if (!u || !u.activo) return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    req.usuario = u;
    next();
  } catch (e) { next(e); }
}

function requerirAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') return res.status(403).json({ error: 'Acción permitida solo a administradores' });
  next();
}

module.exports = { COOKIE, firmar, opcionesCookie, requerirAuth, requerirAdmin, COLUMNAS_PUBLICAS };
