import { h, unwrap } from '../util.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { field, setError, focusFirstError, busy, toast, ayudaCallMeBot } from '../ui.js';

export async function perfil(c) {
  const u = state.user;
  const nombre = h('input', { type: 'text', id: 'perfil-nombre', 'data-testid': 'perfil-nombre', value: u.nombre || '' });
  const wa = h('input', { type: 'tel', id: 'perfil-whatsapp', 'data-testid': 'perfil-whatsapp', value: u.whatsapp || '', inputmode: 'numeric' });
  const key = h('input', { type: 'text', id: 'perfil-apikey', 'data-testid': 'perfil-apikey', value: u.callmebot_apikey || '', spellcheck: 'false' });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit', 'data-testid': 'perfil-guardar' }, 'Guardar perfil');
  const f1 = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); ['perfil-nombre', 'perfil-whatsapp'].forEach((i) => setError(f1, i, ''));
    const dig = wa.value.replace(/[\s+()-]/g, ''); let bad = false;
    if (!nombre.value.trim()) { setError(f1, 'perfil-nombre', 'Escribe tu nombre.'); bad = true; }
    if (dig && !/^\d{10,15}$/.test(dig)) { setError(f1, 'perfil-whatsapp', 'Escribe solo dígitos con indicativo, por ejemplo 573001234567.'); bad = true; }
    if (bad) return focusFirstError(f1);
    busy(btn, true, 'Guardando…');
    try { const r = await api('/usuarios/yo', { method: 'PUT', body: { nombre: nombre.value.trim(), whatsapp: dig || null, callmebot_apikey: key.value.trim() || null } }); Object.assign(state.user, unwrap(r, 'usuario') || {}, { nombre: nombre.value.trim(), whatsapp: dig || null, callmebot_apikey: key.value.trim() || null }); toast('Perfil guardado'); }
    catch (ex) { toast(ex.message, 'error'); }
    busy(btn, false);
  } }, field({ id: 'perfil-nombre', label: 'Nombre', control: nombre, required: true }), ayudaCallMeBot(),
    field({ id: 'perfil-whatsapp', label: 'WhatsApp', control: wa, hint: 'Con indicativo y sin signos. Ejemplo: 573001234567.' }), field({ id: 'perfil-apikey', label: 'Apikey de CallMeBot', control: key }), btn);

  const act = h('input', { type: 'password', id: 'clave-actual', 'data-testid': 'clave-actual', autocomplete: 'current-password' });
  const nue = h('input', { type: 'password', id: 'clave-nueva', 'data-testid': 'clave-nueva', autocomplete: 'new-password' });
  const b2 = h('button', { class: 'btn', type: 'submit', 'data-testid': 'clave-guardar' }, 'Cambiar contraseña');
  const f2 = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); ['clave-actual', 'clave-nueva'].forEach((i) => setError(f2, i, '')); let bad = false;
    if (!act.value) { setError(f2, 'clave-actual', 'Escribe tu contraseña actual.'); bad = true; }
    if (nue.value.length < 8) { setError(f2, 'clave-nueva', 'La nueva contraseña debe tener al menos 8 caracteres.'); bad = true; }
    if (bad) return focusFirstError(f2);
    busy(b2, true, 'Cambiando…');
    try { await api('/auth/cambiar-clave', { method: 'POST', body: { actual: act.value, nueva: nue.value } }); toast('Contraseña cambiada'); f2.reset(); } catch (ex) { toast(ex.message, 'error'); }
    busy(b2, false);
  } }, field({ id: 'clave-actual', label: 'Contraseña actual', control: act, required: true }), field({ id: 'clave-nueva', label: 'Contraseña nueva', control: nue, required: true, hint: 'Mínimo 8 caracteres.' }), b2);

  c.replaceChildren(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Mi perfil'), h('p', {}, u.email))),
    h('div', { class: 'occ' }, h('section', { class: 'card' }, h('h2', {}, 'Datos y alertas de WhatsApp'), f1), h('section', { class: 'card' }, h('h2', {}, 'Contraseña'), f2)));
}
