'use strict';
const db = require('../db');
const { inicioDiaLocal } = require('../tiempo');
const { enviarCorreo, plantillaAlerta } = require('./mailer');
const { enviarWhatsapp } = require('./whatsapp');

const HORA_PREVIAS_MS = 7 * 3600 * 1000;   // d3/d2/d1 desde las 07:00 locales
const DIA_MS = 86400000;
const INTERVALO_DIA_MS = 30 * 60 * 1000;
const PREVIAS = [['d3', 3], ['d2', 2], ['d1', 1]];

let ejecutando = false;

/** Determina qué tipo de alerta corresponde (o null). Pura: depende solo de sus argumentos. */
function tipoPendiente(now, venceEn, enviados, ultimoDia) {
  const inicioDia = inicioDiaLocal(venceEn).getTime();
  const t = now.getTime();
  if (t >= inicioDia) {
    if (ultimoDia == null || t - ultimoDia >= INTERVALO_DIA_MS) return 'dia';
    return null;
  }
  // Previas: solo la más reciente elegible (evita enviar d3+d2+d1 juntas si se creó tarde).
  let elegible = null;
  for (const [tipo, dias] of PREVIAS) {
    if (t >= inicioDia - dias * DIA_MS + HORA_PREVIAS_MS) elegible = tipo;
  }
  if (!elegible) return null;
  const orden = PREVIAS.map((p) => p[0]);
  const idx = orden.indexOf(elegible);
  const yaEnviadaIgualOPosterior = orden.slice(idx).some((tp) => enviados.has(tp));
  return yaEnviadaIgualOPosterior ? null : elegible;
}

async function registrar(ocurrenciaId, tipo, canal, destino, now, r) {
  await db.query(
    `INSERT INTO alertas_log (ocurrencia_id,tipo,canal,destino,enviado_en,ok,detalle) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ocurrenciaId, tipo, canal, destino, now, r.ok, r.detalle]);
}

async function enviarAlerta(o, tipo, now) {
  const { html, text, url, encabezado } = plantillaAlerta({
    tipo, titulo: o.titulo, venceEn: o.vence_en, ocurrenciaId: o.id, nombre: o.responsable_nombre });
  const resultados = [];
  // Correo siempre se intenta/registra; un fallo no bloquea WhatsApp.
  try {
    const r = await enviarCorreo({ to: o.responsable_email, subject: `[SISALERT] ${encabezado}: ${o.titulo}`, html, text });
    await registrar(o.id, tipo, 'correo', o.responsable_email, now, r);
    resultados.push({ canal: 'correo', ...r });
  } catch (e) { console.error('[alertas] correo:', e.message); }
  try {
    const r = await enviarWhatsapp({
      phone: o.responsable_whatsapp, apikey: o.responsable_apikey,
      text: `SISALERT - ${encabezado}\n${o.titulo}\nMarcar como realizada: ${url}` });
    if (!r.omitido) {
      await registrar(o.id, tipo, 'whatsapp', o.responsable_whatsapp, now, r);
      resultados.push({ canal: 'whatsapp', ...r });
    }
  } catch (e) { console.error('[alertas] whatsapp:', e.message); }
  return resultados;
}

/**
 * Procesa alertas con el reloj `now` recibido (puro respecto al reloj: no usa Date.now()).
 * Devuelve [{ocurrencia_id, tipo}] de las alertas enviadas en este tick.
 */
async function tick(now = new Date()) {
  if (ejecutando) return { omitido: true, enviadas: [] };
  ejecutando = true;
  try {
    const horizonte = new Date(now.getTime() + 4 * DIA_MS);
    const r = await db.query(
      `SELECT o.id, o.vence_en, a.titulo, u.nombre AS responsable_nombre, u.email AS responsable_email,
              u.whatsapp AS responsable_whatsapp, u.callmebot_apikey AS responsable_apikey
         FROM ocurrencias o
         JOIN actividades a ON a.id=o.actividad_id AND a.activa
         JOIN usuarios u ON u.id=a.responsable_id AND u.activo
        WHERE o.estado='pendiente' AND o.vence_en <= $1
        ORDER BY o.vence_en`, [horizonte]);
    if (!r.rowCount) return { enviadas: [] };
    const ids = r.rows.map((x) => x.id);
    const logs = await db.query(
      `SELECT ocurrencia_id, tipo, MAX(enviado_en) AS ultimo FROM alertas_log
        WHERE ocurrencia_id = ANY($1) GROUP BY ocurrencia_id, tipo`, [ids]);
    const porOc = new Map();
    for (const l of logs.rows) {
      if (!porOc.has(l.ocurrencia_id)) porOc.set(l.ocurrencia_id, { enviados: new Set(), ultimoDia: null });
      const e = porOc.get(l.ocurrencia_id);
      e.enviados.add(l.tipo);
      if (l.tipo === 'dia') e.ultimoDia = new Date(l.ultimo).getTime();
    }
    const enviadas = [];
    for (const o of r.rows) {
      const e = porOc.get(o.id) || { enviados: new Set(), ultimoDia: null };
      const tipo = tipoPendiente(now, new Date(o.vence_en), e.enviados, e.ultimoDia);
      if (!tipo) continue;
      try {
        await enviarAlerta(o, tipo, now);
        enviadas.push({ ocurrencia_id: o.id, tipo });
      } catch (err) { console.error('[alertas] fallo en ocurrencia', o.id, err.message); }
    }
    return { enviadas };
  } finally {
    ejecutando = false;
  }
}

module.exports = { tick, tipoPendiente, enviarAlerta };
