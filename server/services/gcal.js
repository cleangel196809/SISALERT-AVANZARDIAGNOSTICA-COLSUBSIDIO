'use strict';
// Integración con Google Calendar (cuenta de servicio). Sin credenciales: se omite sin error.
const TZ = 'America/Bogota';
const RRULE = {
  semanal: 'FREQ=WEEKLY',
  mensual: 'FREQ=MONTHLY',
  trimestral: 'FREQ=MONTHLY;INTERVAL=3',
  semestral: 'FREQ=MONTHLY;INTERVAL=6',
  anual: 'FREQ=YEARLY',
};

let cliente = null;

function credenciales() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !process.env.GOOGLE_CALENDAR_ID) return null;
  try {
    let txt = raw.trim();
    if (!txt.startsWith('{')) txt = Buffer.from(txt, 'base64').toString('utf8');
    const j = JSON.parse(txt);
    if (j.private_key) j.private_key = j.private_key.replace(/\\n/g, '\n');
    return j;
  } catch (e) {
    console.warn('[gcal] GOOGLE_SERVICE_ACCOUNT_JSON inválido:', e.message);
    return null;
  }
}

function obtenerCliente() {
  if (cliente) return cliente;
  const cred = credenciales();
  if (!cred) return null;
  const { google } = require('googleapis');
  const auth = new google.auth.JWT({ email: cred.client_email, key: cred.private_key, scopes: ['https://www.googleapis.com/auth/calendar'] });
  cliente = google.calendar({ version: 'v3', auth });
  return cliente;
}

function cuerpoEvento(act) {
  const inicio = new Date(act.fecha_inicio);
  const fin = new Date(inicio.getTime() + 30 * 60000);
  const ev = {
    summary: act.titulo,
    description: [act.descripcion, act.categoria ? `Categoría: ${act.categoria}` : null, 'Generado por SISALERT'].filter(Boolean).join('\n'),
    start: { dateTime: inicio.toISOString(), timeZone: TZ },
    end: { dateTime: fin.toISOString(), timeZone: TZ },
  };
  const regla = RRULE[act.frecuencia];
  if (regla) {
    let r = `RRULE:${regla}`;
    if (act.fecha_fin) r += `;UNTIL=${String(act.fecha_fin).replace(/-/g, '')}T235959Z`;
    ev.recurrence = [r];
  }
  return ev;
}

/** Devuelve el id del evento o null. */
async function crearEvento(act) {
  const c = obtenerCliente();
  if (!c) return null;
  try {
    const r = await c.events.insert({ calendarId: process.env.GOOGLE_CALENDAR_ID, requestBody: cuerpoEvento(act) });
    return r.data.id || null;
  } catch (e) { console.warn('[gcal] crear falló:', e.message); return null; }
}

/** Devuelve el id vigente (puede ser nuevo si no existía). */
async function actualizarEvento(act) {
  const c = obtenerCliente();
  if (!c) return act.gcal_event_id || null;
  if (!act.gcal_event_id) return crearEvento(act);
  try {
    await c.events.update({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: act.gcal_event_id, requestBody: cuerpoEvento(act) });
    return act.gcal_event_id;
  } catch (e) { console.warn('[gcal] actualizar falló:', e.message); return act.gcal_event_id; }
}

async function borrarEvento(act) {
  const c = obtenerCliente();
  if (!c || !act.gcal_event_id) return;
  try { await c.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: act.gcal_event_id }); }
  catch (e) { console.warn('[gcal] borrar falló:', e.message); }
}

module.exports = { crearEvento, actualizarEvento, borrarEvento, cuerpoEvento };
