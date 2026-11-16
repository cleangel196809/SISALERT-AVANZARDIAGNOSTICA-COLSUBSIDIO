'use strict';
// Páginas públicas de respuesta a una alerta (enlace firmado, sin iniciar sesión).
// Los GET nunca modifican datos (los antivirus/visores de correo abren enlaces); solo los POST actúan.
const express = require('express');
const multer = require('multer');
const db = require('../db');
const { leerToken } = require('../services/enlaces');
const { formatoLargo } = require('../tiempo');

const r = express.Router();
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const urlencoded = express.urlencoded({ extended: false, limit: '20kb' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina(titulo, cuerpo, status = 200) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(titulo)} - SISALERT</title><style>
:root{--rojo:#E30613;--azul:#003B71;--verde:#00A859;--ambar:#F5A300;--gris:#F4F5F7}
*{box-sizing:border-box}body{margin:0;background:var(--gris);font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1b1b1b}
header{background:var(--azul);color:#fff;padding:14px 20px;border-bottom:4px solid var(--rojo);display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header img{height:40px;background:#fff;border-radius:6px;padding:3px 8px}header b{font-size:18px}
main{max-width:560px;margin:20px auto;padding:0 14px}.card{background:#fff;border-radius:12px;padding:22px;box-shadow:0 1px 4px #0002}
h1{color:var(--azul);font-size:22px;margin:0 0 6px}.meta{color:#555;margin:0 0 18px}
label{display:block;font-weight:700;margin:14px 0 6px;color:var(--azul)}
input[type=file],textarea{width:100%;padding:12px;border:2px solid #b9c3cf;border-radius:8px;font:inherit;background:#fff}
textarea{min-height:130px}input:focus,textarea:focus,.btn:focus{outline:3px solid #1a73e8;outline-offset:2px}
.btn{display:block;width:100%;text-align:center;border:0;border-radius:8px;padding:14px;margin-top:14px;font:inherit;font-weight:700;font-size:17px;color:#fff;text-decoration:none;cursor:pointer}
.ok{background:var(--verde)}.am{background:var(--ambar);color:#1b1b1b}.az{background:var(--azul)}.gr{background:#e7ebf0;color:#1b1b1b}
.msg{padding:12px 14px;border-radius:8px;margin:0 0 14px}.msg.exito{background:#e3f6ec;border:1px solid var(--verde)}.msg.error{background:#fdeaea;border:1px solid var(--rojo)}
small{color:#666;display:block;margin-top:6px}
</style></head><body><header><img src="/img/logos/avanzar-diagnostica.svg" alt="Avanzar Diagnóstica"><img src="/img/logos/colsubsidio-salud.svg" alt="Colsubsidio Salud"><b>SISALERT</b></header>
<main><div class="card">${cuerpo}</div></main></body></html>`;
  return { html, status };
}
const enviar = (res, p) => res.status(p.status).type('html').set('Cache-Control', 'no-store').send(p.html);
const errorPagina = (msg, status = 400) => pagina('Aviso', `<h1>No se pudo continuar</h1><div class="msg error">${esc(msg)}</div>`, status);

async function contexto(token) {
  const t = leerToken(token);
  if (!t) return { error: errorPagina('El enlace no es válido o está incompleto. Pida un recordatorio nuevo o ingrese a SISALERT.', 400) };
  const q = await db.query(
    `SELECT o.id, o.vence_en, o.estado, a.titulo, a.descripcion, a.responsable_id, u.nombre, u.activo
       FROM ocurrencias o JOIN actividades a ON a.id=o.actividad_id JOIN usuarios u ON u.id=a.responsable_id
      WHERE o.id=$1`, [t.ocurrenciaId]);
  const o = q.rows[0];
  if (!o) return { error: errorPagina('La actividad ya no existe.', 404) };
  if (o.responsable_id !== t.usuarioId || !o.activo) return { error: errorPagina('Este enlace ya no es válido para esta actividad.', 403) };
  return { o, t };
}

const cabecera = (o) => `<h1>${esc(o.titulo)}</h1><p class="meta">Vence: <b>${esc(formatoLargo(o.vence_en))}</b> &middot; Responsable: ${esc(o.nombre)}</p>`;
const yaCumplida = (o) => pagina('Actividad cumplida', `${cabecera(o)}<div class="msg exito">Esta actividad ya fue marcada como cumplida. No recibirá más alertas.</div>`);

// Resumen con los tres botones
r.get('/:token', async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    if (c.o.estado === 'cumplida') return enviar(res, yaCumplida(c.o));
    const b = `/r/${esc(req.params.token)}`;
    enviar(res, pagina('Responder alerta', `${cabecera(c.o)}${c.o.descripcion ? `<p>${esc(c.o.descripcion)}</p>` : ''}
<a class="btn ok" href="${b}/cumplido">&#10003; Cumplido (subir foto)</a>
<a class="btn am" href="${b}/pendiente">&#8987; Pendiente</a>
<a class="btn az" href="${b}/notas">&#9998; Notas</a>`));
  } catch (e) { next(e); }
});

// --- CUMPLIDO ---
r.get('/:token/cumplido', async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    if (c.o.estado === 'cumplida') return enviar(res, yaCumplida(c.o));
    enviar(res, pagina('Marcar como cumplido', `${cabecera(c.o)}
<form method="post" enctype="multipart/form-data" action="/r/${esc(req.params.token)}/cumplido">
<label for="evidencia">Foto de evidencia (obligatoria)</label>
<input id="evidencia" name="evidencia" type="file" accept="image/*" capture="environment" required>
<small>JPG, PNG, WEBP o HEIC, hasta 6 MB.</small>
<label for="comentario">Comentario (opcional)</label><textarea id="comentario" name="comentario" maxlength="2000"></textarea>
<button class="btn ok" type="submit">Marcar como cumplido</button></form>`));
  } catch (e) { next(e); }
});
r.post('/:token/cumplido', (req, res, next) => {
  upload.single('evidencia')(req, res, (err) => {
    if (!err) return next();
    enviar(res, errorPagina(err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera el máximo de 6 MB.' : 'No se pudo leer la foto.', 400));
  });
}, async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    if (c.o.estado === 'cumplida') return enviar(res, yaCumplida(c.o));
    if (!req.file || !req.file.buffer?.length) return enviar(res, errorPagina('Debe adjuntar una foto de evidencia. Vuelva atrás y seleccione la foto.'));
    if (!MIMES.includes(req.file.mimetype)) return enviar(res, errorPagina('Formato de imagen no permitido (use JPG, PNG, WEBP o HEIC).'));
    const comentario = req.body?.comentario ? String(req.body.comentario).slice(0, 2000) : null;
    const q = await db.query(
      `UPDATE ocurrencias SET estado='cumplida', cumplida_en=now(), cumplida_por=$1, comentario=COALESCE($2, comentario),
              evidencia=$3, evidencia_mime=$4 WHERE id=$5 AND estado='pendiente'`,
      [c.t.usuarioId, comentario, req.file.buffer, req.file.mimetype, c.o.id]);
    if (!q.rowCount) return enviar(res, yaCumplida(c.o));
    enviar(res, pagina('Cumplido', `${cabecera(c.o)}<div class="msg exito"><b>Listo.</b> La actividad quedó marcada como cumplida con su evidencia. Se detuvieron las alertas.</div>`));
  } catch (e) { next(e); }
});

// --- PENDIENTE ---
r.get('/:token/pendiente', async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    if (c.o.estado === 'cumplida') return enviar(res, yaCumplida(c.o));
    enviar(res, pagina('Dejar pendiente', `${cabecera(c.o)}
<p>Registra que la actividad <b>todavía no se ha realizado</b>. Las alertas continúan hasta que suba la foto de evidencia.</p>
<form method="post" action="/r/${esc(req.params.token)}/pendiente">
<label for="texto">Motivo (opcional)</label><textarea id="texto" name="texto" maxlength="2000" placeholder="Ej.: falta reactivo, se hace mañana a primera hora"></textarea>
<button class="btn am" type="submit">Confirmar: sigue pendiente</button></form>`));
  } catch (e) { next(e); }
});
r.post('/:token/pendiente', urlencoded, async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    if (c.o.estado === 'cumplida') return enviar(res, yaCumplida(c.o));
    const texto = req.body?.texto ? String(req.body.texto).trim().slice(0, 2000) : null;
    await db.query(`INSERT INTO ocurrencia_notas (ocurrencia_id, usuario_id, tipo, texto) VALUES ($1,$2,'pendiente',$3)`, [c.o.id, c.t.usuarioId, texto]);
    enviar(res, pagina('Registrado', `${cabecera(c.o)}<div class="msg exito"><b>Registrado como pendiente.</b> Seguirá recibiendo recordatorios hasta que suba la evidencia.</div>
<a class="btn ok" href="/r/${esc(req.params.token)}/cumplido">Ya la hice: subir foto</a>`));
  } catch (e) { next(e); }
});

// --- NOTAS ---
r.get('/:token/notas', async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    const prev = (await db.query(`SELECT tipo, texto, creado_en FROM ocurrencia_notas WHERE ocurrencia_id=$1 ORDER BY creado_en DESC LIMIT 5`, [c.o.id])).rows;
    enviar(res, pagina('Notas', `${cabecera(c.o)}
<form method="post" action="/r/${esc(req.params.token)}/notas">
<label for="texto">Escriba su nota</label><textarea id="texto" name="texto" maxlength="2000" required></textarea>
<button class="btn az" type="submit">Guardar nota</button></form>
${prev.length ? `<h2 style="font-size:16px;color:#003B71;margin-top:22px">Notas anteriores</h2>${prev.map((n) => `<p class="msg" style="background:#f4f5f7"><small>${esc(formatoLargo(n.creado_en))}${n.tipo === 'pendiente' ? ' &middot; pendiente' : ''}</small>${esc(n.texto || '(sin texto)')}</p>`).join('')}` : ''}`));
  } catch (e) { next(e); }
});
r.post('/:token/notas', urlencoded, async (req, res, next) => {
  try {
    const c = await contexto(req.params.token); if (c.error) return enviar(res, c.error);
    const texto = req.body?.texto ? String(req.body.texto).trim().slice(0, 2000) : '';
    if (!texto) return enviar(res, errorPagina('Escriba el texto de la nota.'));
    await db.query(`INSERT INTO ocurrencia_notas (ocurrencia_id, usuario_id, tipo, texto) VALUES ($1,$2,'nota',$3)`, [c.o.id, c.t.usuarioId, texto]);
    enviar(res, pagina('Nota guardada', `${cabecera(c.o)}<div class="msg exito"><b>Nota guardada.</b> La administración y su equipo la pueden ver en SISALERT.${c.o.estado === 'pendiente' ? ' La actividad sigue pendiente y las alertas continúan.' : ''}</div>`));
  } catch (e) { next(e); }
});

module.exports = r;
