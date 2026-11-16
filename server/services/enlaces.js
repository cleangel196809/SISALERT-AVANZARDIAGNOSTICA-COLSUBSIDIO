'use strict';
// Enlaces firmados (sin clave) para responder una alerta desde el correo o WhatsApp.
// Token = <ocurrenciaId>.<usuarioId>.<firma HMAC>. Solo permite actuar sobre ESA ocurrencia como ESE responsable.
const crypto = require('crypto');

const secreto = () => process.env.JWT_SECRET || 'desarrollo-sisalert';
const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const firma = (oc, us) => crypto.createHmac('sha256', secreto()).update(`respuesta:${oc}:${us}`).digest('base64url').slice(0, 32);

function crearToken(ocurrenciaId, usuarioId) {
  return `${ocurrenciaId}.${usuarioId}.${firma(ocurrenciaId, usuarioId)}`;
}

/** Devuelve {ocurrenciaId, usuarioId} o null si el token es inválido. */
function leerToken(token) {
  const m = /^(\d+)\.(\d+)\.([A-Za-z0-9_-]{32})$/.exec(String(token || ''));
  if (!m) return null;
  const esperada = firma(m[1], m[2]);
  const a = Buffer.from(esperada), b = Buffer.from(m[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { ocurrenciaId: Number(m[1]), usuarioId: Number(m[2]) };
}

/** Los tres enlaces de acción de una alerta. */
function enlacesAlerta(ocurrenciaId, usuarioId) {
  if (!ocurrenciaId || !usuarioId) {
    const u = `${appUrl()}/#/panel`;
    return { cumplido: u, pendiente: u, notas: u, resumen: u };
  }
  const t = crearToken(ocurrenciaId, usuarioId);
  const base = `${appUrl()}/r/${t}`;
  return { cumplido: `${base}/cumplido`, pendiente: `${base}/pendiente`, notas: `${base}/notas`, resumen: base };
}

module.exports = { crearToken, leerToken, enlacesAlerta };
