'use strict';
const nodemailer = require('nodemailer');
const { formatoLargo } = require('../tiempo');
const { enlacesAlerta } = require('./enlaces');

let transporte = null;
const esDry = () => String(process.env.MAIL_DRY_RUN).toLowerCase() === 'true';
const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function obtenerTransporte() {
  if (transporte) return transporte;
  const puerto = Number(process.env.SMTP_PORT || 465);
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporte;
}

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ENCABEZADOS = {
  d3: 'Faltan 3 días para esta actividad',
  d2: 'Faltan 2 días para esta actividad',
  d1: 'Mañana vence esta actividad',
  dia: 'HOY vence esta actividad - suba la evidencia',
  prueba: 'Mensaje de prueba de SISALERT',
};

function plantillaAlerta({ tipo, titulo, venceEn, ocurrenciaId, nombre, usuarioId }) {
  const enl = enlacesAlerta(ocurrenciaId, usuarioId);
  const url = enl.cumplido;
  const encabezado = ENCABEZADOS[tipo] || ENCABEZADOS.dia;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F4F5F7;font-family:Arial,Helvetica,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:#003B71;padding:16px 24px"><img src="${appUrl()}/img/logos/avanzar-diagnostica.svg" alt="Avanzar Diagnóstica" height="40" style="vertical-align:middle">
 &nbsp;&nbsp;<img src="${appUrl()}/img/logos/colsubsidio-salud.svg" alt="Colsubsidio Salud" height="40" style="vertical-align:middle"></td></tr>
<tr><td style="background:#E30613;color:#fff;padding:12px 24px;font-size:16px;font-weight:bold">${escapar(encabezado)}</td></tr>
<tr><td style="padding:24px"><p style="margin:0 0 12px">Hola ${escapar(nombre || '')},</p>
<h2 style="margin:0 0 8px;color:#003B71">${escapar(titulo)}</h2>
<p style="margin:0 0 20px">Vence: <strong>${escapar(venceEn ? formatoLargo(venceEn) : '-')}</strong></p>
<p style="margin:0 0 24px">Recibirá recordatorios hasta que suba la foto de evidencia.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding:0 8px 8px 0"><a href="${enl.cumplido}" style="background:#00A859;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">&#10003; Cumplido</a></td>
<td style="padding:0 8px 8px 0"><a href="${enl.pendiente}" style="background:#F5A300;color:#1b1b1b;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">&#8987; Pendiente</a></td>
<td style="padding:0 0 8px 0"><a href="${enl.notas}" style="background:#003B71;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">&#9998; Notas</a></td>
</tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#666">Cumplido: suba la foto de evidencia y se detienen las alertas. Pendiente: avisa que a&uacute;n no se hace (las alertas contin&uacute;an). Notas: deje un mensaje sobre la actividad.</p>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${encabezado}\n\n${titulo}\nVence: ${venceEn ? formatoLargo(venceEn) : '-'}\n\nCumplido: ${enl.cumplido}\nPendiente: ${enl.pendiente}\nNotas: ${enl.notas}`;
  return { html, text, url, encabezado, enlaces: enl };
}

/** Devuelve {ok, detalle}. Nunca lanza. */
async function enviarCorreo({ to, subject, html, text }) {
  if (!to) return { ok: false, detalle: 'Sin destinatario' };
  if (esDry()) return { ok: true, detalle: 'dry-run' };
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return { ok: false, detalle: 'Sin credenciales SMTP (SMTP_USER/SMTP_PASS)' };
  try {
    const info = await obtenerTransporte().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, text,
    });
    return { ok: true, detalle: info.messageId || 'enviado' };
  } catch (e) {
    return { ok: false, detalle: String(e.message || e).slice(0, 300) };
  }
}

module.exports = { enviarCorreo, plantillaAlerta };
