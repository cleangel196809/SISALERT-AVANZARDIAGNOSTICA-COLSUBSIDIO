'use strict';
const esDry = () => String(process.env.WA_DRY_RUN).toLowerCase() === 'true';
const habilitado = () => String(process.env.CALLMEBOT_ENABLED ?? 'true').toLowerCase() !== 'false';

/** CallMeBot. Devuelve {ok, detalle, omitido?}. Nunca lanza. */
async function enviarWhatsapp({ phone, apikey, text }) {
  if (!phone || !apikey) return { ok: false, omitido: true, detalle: 'Usuario sin whatsapp/apikey' };
  if (!habilitado()) return { ok: false, omitido: true, detalle: 'CallMeBot deshabilitado' };
  if (esDry()) return { ok: true, detalle: 'dry-run' };
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const cuerpo = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    return { ok: r.ok, detalle: `HTTP ${r.status} ${cuerpo}`.trim() };
  } catch (e) {
    return { ok: false, detalle: String(e.message || e).slice(0, 300) };
  }
}

module.exports = { enviarWhatsapp };
