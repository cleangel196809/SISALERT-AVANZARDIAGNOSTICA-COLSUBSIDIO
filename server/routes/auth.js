'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { firmar, opcionesCookie, requerirAuth, COOKIE, COLUMNAS_PUBLICAS } = require('../auth');
const { ah, bad } = require('./util');

const r = express.Router();
const HASH_FALSO = bcrypt.hashSync('no-existe', 10);

function sinSecretos(u) {
  const { password_hash, ...resto } = u;
  return resto;
}

r.post('/login', ah(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw bad('Correo y contraseña son obligatorios');
  const q = await db.query('SELECT * FROM usuarios WHERE email=$1', [email]);
  const u = q.rows[0];
  const ok = await bcrypt.compare(password, u ? u.password_hash : HASH_FALSO);
  if (!u || !ok || !u.activo) return res.status(401).json({ error: 'Credenciales inválidas' });
  res.cookie(COOKIE, firmar(u), opcionesCookie());
  res.json({ usuario: sinSecretos(u) });
}));

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { ...opcionesCookie(), maxAge: undefined });
  res.json({ ok: true });
});

r.get('/me', requerirAuth, (req, res) => res.json({ usuario: req.usuario }));

r.post('/cambiar-clave', requerirAuth, ah(async (req, res) => {
  const { actual, nueva } = req.body || {};
  if (!actual || !nueva) throw bad('Debe indicar la clave actual y la nueva');
  if (String(nueva).length < 8) throw bad('La nueva clave debe tener al menos 8 caracteres');
  const q = await db.query('SELECT password_hash FROM usuarios WHERE id=$1', [req.usuario.id]);
  if (!(await bcrypt.compare(String(actual), q.rows[0].password_hash))) return res.status(400).json({ error: 'La clave actual no es correcta' });
  await db.query('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(String(nueva), 10), req.usuario.id]);
  res.json({ ok: true });
}));

module.exports = r;
