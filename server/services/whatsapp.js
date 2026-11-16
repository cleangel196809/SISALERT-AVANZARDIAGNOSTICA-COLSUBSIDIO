'use strict';
const esDry = () => String(process.env.WA_DRY_RUN).toLowerCase() === 'true';
const habilitado = () => String(process.env.CALLMEBOT_ENABLED ?? 'true').toLowerCase() !== 'false';

// CallMeBot a veces responde HTTP 200 con un texto de error; hay que leer el cuerpo.
const PATRON_ERROR = /error|invalid|incorrect|wrong|not\s+(found|activated|registered|authorized)|blocked|forbidden|unauthorized|apikey is|api key is/i;
const PATRON_OK = /message\s+queued|queued|sent|enviado/i;

/** Número internacional: solo dígitos con prefijo '+'. Un número colombiano de 10 dígitos recibe el 57. */
function normalizarTelefono(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 && d.startsWith('3')) d = '57' + d;
  return '+' + d;
}

/** CallMeBot. Devuelve {ok, detalle, omitido?}. Nunca lanza. */
async function enviarWhatsapp({ phone, apikey, text }) {
  const tel = normalizarTelefono(phone);
  const clave = String(apikey ?? '').trim();
  if (!tel || !clave) return { ok: false, omitido: true, detalle: 'Usuario sin whatsapp/apikey' };
  if (!habilitado()) return { ok: false, omitido: true, detalle: 'CallMeBot deshabilitado' };
  if (esDry()) return { ok: true, detalle: 'dry-run' };
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(tel)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(clave)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const cuerpo = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    const rechazado = PATRON_ERROR.test(cuerpo) && !PATRON_OK.test(cuerpo);
    return { ok: r.ok && !rechazado, detalle: `HTTP ${r.status} ${cuerpo}`.trim() };
  } catch (e) {
    return { ok: false, detalle: String(e.message || e).slice(0, 300) };
  }
}

module.exports = { enviarWhatsapp, normalizarTelefono };
