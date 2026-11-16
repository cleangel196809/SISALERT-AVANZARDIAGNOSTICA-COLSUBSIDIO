import { h, icon, CARGOS, cargoLabel, listOf } from '../util.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { empty, modal, confirmar, toast, field, setError, focusFirstError, busy, ayudaCallMeBot } from '../ui.js';

export async function usuarios(c) {
  let data = listOf(await api('/usuarios'), 'usuarios');
  const host = h('div');
  async function refresh() { data = listOf(await api('/usuarios'), 'usuarios'); draw(); }
  c.replaceChildren(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Usuarios'), h('p', {}, 'Crea cuentas, configura WhatsApp y prueba que las alertas lleguen.')),
    h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'btn-nuevo-usuario', onclick: () => abrirForm(null, refresh) }, icon('plus'), 'Nuevo usuario')), ayudaCallMeBot(), host);
  function draw() {
    if (!data.length) return host.replaceChildren(empty({ img: 'img/forms/field-responsable.svg', title: 'No hay usuarios', text: 'Crea la primera cuenta para asignar actividades.' }));
    host.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { 'data-testid': 'tabla-usuarios' }, h('caption', {}, `${data.length} usuarios`),
      h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'Rol', 'Cargo', 'WhatsApp', 'CallMeBot', 'Estado', 'Acciones'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, data.map((u) => h('tr', { 'data-testid': 'usuario-fila', 'data-id': u.id },
        h('td', {}, u.nombre), h('td', {}, u.email), h('td', {}, u.rol === 'admin' ? 'Administrador' : 'Usuario'), h('td', {}, cargoLabel(u.cargo)),
        h('td', {}, u.whatsapp || '—'), h('td', {}, u.callmebot_apikey ? h('span', { class: 'badge cumplida' }, 'Configurada') : h('span', { class: 'badge ambar' }, 'Falta apikey')),
        h('td', {}, h('span', { class: 'badge ' + (u.activo === false ? 'vencida' : 'cumplida') }, u.activo === false ? 'Inactivo' : 'Activo')),
        h('td', {}, h('div', { class: 'actions' },
          h('button', { class: 'btn btn-sm', type: 'button', 'data-testid': 'usr-editar-' + u.id, 'aria-label': 'Editar a ' + u.nombre, onclick: () => abrirForm(u, refresh) }, icon('edit'), 'Editar'),
          h('button', { class: 'btn btn-sm', type: 'button', 'data-testid': 'usr-probar-' + u.id, 'aria-label': 'Probar alerta para ' + u.nombre, onclick: (ev) => probar(u, ev.currentTarget) }, icon('send'), 'Probar alerta'),
          u.id !== state.user.id ? h('button', { class: 'btn btn-sm btn-peligro', type: 'button', 'data-testid': 'usr-eliminar-' + u.id, 'aria-label': 'Eliminar a ' + u.nombre, onclick: async () => {
            if (!(await confirmar({ title: 'Eliminar usuario', text: `Se eliminará la cuenta de ${u.nombre}. Sus actividades pueden quedar sin responsable. Esta acción no se puede deshacer.` }))) return;
            try { await api('/usuarios/' + u.id, { method: 'DELETE' }); toast('Usuario eliminado'); refresh(); } catch (e) { toast(e.message, 'error'); } } }, icon('trash'), 'Eliminar') : null))))))));
  }
  draw();
}

async function probar(u, btn) {
  busy(btn, true, 'Enviando…');
  try {
    const r = await api(`/usuarios/${u.id}/probar-alerta`, { method: 'POST' });
    const det = r && typeof r === 'object' ? Object.entries(r).filter(([k, v]) => k !== 'ok' && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
    toast(`Alerta de prueba enviada a ${u.nombre}.` + (det ? ' ' + det : ''));
  } catch (e) { toast(e.message, 'error'); }
  busy(btn, false);
}

export function abrirForm(u, done) {
  const edit = !!u; u = u || { rol: 'usuario', cargo: 'bacteriologa', activo: true };
  const inp = (id, type, val, extra = {}) => h('input', { type, id, 'data-testid': id, value: val ?? '', autocomplete: 'off', ...extra });
  const nombre = inp('usr-nombre', 'text', u.nombre), email = inp('usr-email', 'email', u.email, { autocapitalize: 'off' });
  const clave = inp('usr-clave', 'password', '', { autocomplete: 'new-password' });
  const rol = h('select', { id: 'usr-rol', 'data-testid': 'usr-rol' }, [['usuario', 'Usuario'], ['admin', 'Administrador']].map(([v, t]) => h('option', { value: v, selected: u.rol === v }, t)));
  const cargo = h('select', { id: 'usr-cargo', 'data-testid': 'usr-cargo' }, CARGOS.map(([v, t]) => h('option', { value: v, selected: u.cargo === v }, t)));
  const wa = inp('usr-whatsapp', 'tel', u.whatsapp, { inputmode: 'numeric' }), key = inp('usr-apikey', 'text', u.callmebot_apikey, { spellcheck: 'false' });
  const activo = h('input', { type: 'checkbox', id: 'usr-activo', 'data-testid': 'usr-activo', checked: u.activo !== false });
  const msg = h('div', { class: 'alert-box', role: 'alert', hidden: true, 'data-testid': 'usr-error' });
  const save = h('button', { class: 'btn btn-primary', type: 'submit', 'data-testid': 'usr-guardar' }, edit ? 'Guardar cambios' : 'Crear usuario');
  let m;
  const form = h('form', { novalidate: true, 'data-testid': 'usr-form', onsubmit: async (e) => {
    e.preventDefault(); msg.hidden = true;
    ['usr-nombre', 'usr-email', 'usr-clave', 'usr-whatsapp'].forEach((i) => setError(form, i, ''));
    let bad = false; const E = (i, t) => { setError(form, i, t); bad = true; };
    if (!nombre.value.trim()) E('usr-nombre', 'Escribe el nombre completo.');
    if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) E('usr-email', 'Escribe un correo válido, por ejemplo nombre@dominio.com.');
    if (!edit && clave.value.length < 8) E('usr-clave', 'La contraseña debe tener al menos 8 caracteres.');
    else if (edit && clave.value && clave.value.length < 8) E('usr-clave', 'La nueva contraseña debe tener al menos 8 caracteres.');
    const dig = wa.value.replace(/[\s+()-]/g, '');
    if (dig && !/^\d{10,15}$/.test(dig)) E('usr-whatsapp', 'Escribe solo dígitos con indicativo de país, por ejemplo 573001234567.');
    if (bad) return focusFirstError(form);
    const body = { nombre: nombre.value.trim(), email: email.value.trim(), rol: rol.value, cargo: cargo.value, whatsapp: dig || null, callmebot_apikey: key.value.trim() || null, activo: activo.checked };
    if (clave.value) body.password = clave.value;
    busy(save, true, 'Guardando…');
    try { await api(edit ? '/usuarios/' + u.id : '/usuarios', { method: edit ? 'PUT' : 'POST', body }); toast(edit ? 'Usuario actualizado' : 'Usuario creado'); m.close(); done(); }
    catch (ex) { msg.textContent = ex.message; msg.hidden = false; busy(save, false); }
  } }, msg,
    field({ id: 'usr-nombre', label: 'Nombre completo', control: nombre, required: true }),
    field({ id: 'usr-email', label: 'Correo electrónico', control: email, required: true }),
    field({ id: 'usr-clave', label: edit ? 'Nueva contraseña' : 'Contraseña', control: clave, required: !edit, hint: edit ? 'Déjala vacía para conservar la actual.' : 'Mínimo 8 caracteres.' }),
    field({ id: 'usr-rol', label: 'Rol', control: rol }), field({ id: 'usr-cargo', label: 'Cargo', control: cargo }),
    ayudaCallMeBot(),
    field({ id: 'usr-whatsapp', label: 'WhatsApp', control: wa, hint: 'Con indicativo y sin signos. Ejemplo: 573001234567.' }),
    field({ id: 'usr-apikey', label: 'Apikey de CallMeBot', control: key, hint: 'La envía CallMeBot por WhatsApp tras activarlo.' }),
    h('label', { class: 'check', for: 'usr-activo' }, activo, 'Cuenta activa (recibe alertas y puede ingresar)'),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'button', 'data-testid': 'usr-cancelar', onclick: () => m.close() }, 'Cancelar'), save));
  m = modal({ title: edit ? 'Editar usuario' : 'Nuevo usuario', body: form, testid: 'modal-usuario' });
}
