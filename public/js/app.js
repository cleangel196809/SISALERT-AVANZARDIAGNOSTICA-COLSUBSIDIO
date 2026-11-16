import { $, h, icon } from './util.js';
import { api, setUnauthorizedHandler } from './api.js';
import { state, isAdmin, go } from './state.js';
import { spinner, errorBox, modal, hasModal, toast, field, setError, focusFirstError, busy } from './ui.js';
import { panel } from './views/panel.js';
import { calendario } from './views/calendario.js';
import { actividades } from './views/actividades.js';
import { actividadForm } from './views/actividad-form.js';
import { ocurrencia } from './views/ocurrencia.js';
import { usuarios } from './views/usuarios.js';
import { alertas } from './views/alertas.js';
import { perfil } from './views/perfil.js';

const app = $('#app');
const ROUTES = [
  [/^#\/panel$/, panel, 'panel'],
  [/^#\/calendario$/, calendario, 'calendario'],
  [/^#\/actividades$/, actividades, 'actividades'],
  [/^#\/actividad\/nueva(?:\?(.*))?$/, (c, m) => actividadForm(c, null, new URLSearchParams(m[1] || '')), 'actividades'],
  [/^#\/actividad\/(\d+)$/, (c, m) => actividadForm(c, m[1], new URLSearchParams()), 'actividades'],
  [/^#\/ocurrencia\/(\d+)$/, (c, m) => ocurrencia(c, m[1]), 'actividades'],
  [/^#\/usuarios$/, usuarios, 'usuarios', true],
  [/^#\/alertas$/, alertas, 'alertas'],
  [/^#\/perfil$/, perfil, 'perfil'],
];

setUnauthorizedHandler(() => { if (state.user) { state.user = null; toast('Tu sesión terminó. Inicia sesión de nuevo.', 'error'); render(); } });

async function boot() {
  app.replaceChildren(spinner('Iniciando SISALERT…'));
  try { const r = await api('/auth/me'); state.user = r.usuario || r; } catch { state.user = null; }
  window.addEventListener('hashchange', render);
  render();
}

function render() {
  if (!state.user) return renderWelcome();
  const hash = location.hash;
  if (!hash || hash === '#/' || hash === '#/bienvenida') { location.hash = '#/panel'; return; }
  let found = null;
  for (const r of ROUTES) { const m = hash.match(r[0]); if (m) { found = { r, m }; break; } }
  renderShell(found ? found.r[2] : '');
  const main = $('#main');
  if (!found) { main.replaceChildren(h('h1', { tabindex: '-1' }, 'Página no encontrada'), h('p', {}, 'La dirección no existe. '), h('a', { href: '#/panel', class: 'btn' }, 'Ir al panel')); return; }
  if (found.r[3] && !isAdmin()) { main.replaceChildren(h('h1', { tabindex: '-1' }, 'Sin permiso'), errorBox('Solo las personas administradoras pueden ver esta sección.')); return; }
  main.replaceChildren(spinner());
  Promise.resolve(found.r[1](main, found.m)).then(() => {
    const t = main.querySelector('h1'); if (t) { document.title = t.textContent + ' · SISALERT'; if (!hasModal()) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } }
  }).catch((e) => main.replaceChildren(errorBox(e.message, render)));
}

function renderShell(active) {
  if (!$('.topbar')) {
    const u = state.user;
    const navItems = [['panel', 'Panel', 'home'], ['calendario', 'Calendario', 'calendar'], ['actividades', 'Mis actividades', 'list']];
    if (isAdmin()) navItems.push(['usuarios', 'Usuarios', 'users']);
    navItems.push(['alertas', 'Alertas', 'bell']);
    app.replaceChildren(
      h('header', { class: 'topbar' },
        h('div', { class: 'logos' }, h('img', { src: 'img/logos/avanzar-diagnostica.svg', alt: 'Avanzar Diagnóstica' }), h('img', { src: 'img/logos/colsubsidio-salud.svg', alt: 'Colsubsidio Salud' })),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'btn-nueva-actividad', 'aria-keyshortcuts': 'n', onclick: () => go('#/actividad/nueva') }, icon('plus'), 'Nueva actividad'),
        h('div', { class: 'userbox' },
          h('div', { class: 'who', 'data-testid': 'user-nombre' }, u.nombre, h('small', {}, u.rol === 'admin' ? 'Administración' : 'Usuario')),
          h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Atajos de teclado', title: 'Atajos de teclado (?)', 'data-testid': 'btn-atajos', onclick: showHelp }, icon('help')),
          h('a', { class: 'btn btn-icon', href: '#/perfil', 'aria-label': 'Mi perfil', title: 'Mi perfil', 'data-testid': 'btn-perfil' }, icon('user')),
          h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Cerrar sesión', title: 'Cerrar sesión', 'data-testid': 'btn-logout', onclick: logout }, icon('logout')))),
      h('nav', { class: 'nav', 'aria-label': 'Principal' },
        navItems.map(([k, t, i]) => h('a', { href: '#/' + k, 'data-nav': k, 'data-testid': 'nav-' + k }, icon(i), t))),
      h('main', { id: 'main', tabindex: '-1' }));
  }
  document.querySelectorAll('.nav a').forEach((a) => { if (a.dataset.nav === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignorar */ }
  state.user = null; location.hash = ''; render();
}

function renderWelcome() {
  document.title = 'Bienvenida · SISALERT';
  const email = h('input', { type: 'email', id: 'login-email', name: 'email', autocomplete: 'username', 'data-testid': 'login-email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false' });
  const pass = h('input', { type: 'password', id: 'login-password', name: 'password', autocomplete: 'current-password', 'data-testid': 'login-password' });
  const err = h('div', { class: 'alert-box', role: 'alert', hidden: true, 'data-testid': 'login-error' });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit', 'data-testid': 'login-submit', style: 'width:100%' }, 'Ingresar');
  const form = h('form', { novalidate: true, 'data-testid': 'login-form', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    let bad = false;
    setError(form, 'login-email', ''); setError(form, 'login-password', '');
    if (!email.value.trim()) { setError(form, 'login-email', 'Escribe tu correo electrónico.'); bad = true; }
    else if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) { setError(form, 'login-email', 'El correo no parece válido. Revisa que tenga @ y dominio.'); bad = true; }
    if (!pass.value) { setError(form, 'login-password', 'Escribe tu contraseña.'); bad = true; }
    if (bad) return focusFirstError(form);
    busy(btn, true, 'Ingresando…');
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email: email.value.trim(), password: pass.value } });
      state.user = r.usuario || r;
      const next = sessionStorage.getItem('sisalert_next'); sessionStorage.removeItem('sisalert_next');
      location.hash = next || '#/panel'; render();
    } catch (ex) { err.textContent = ex.status === 401 ? 'Correo o contraseña incorrectos. Verifica los datos e inténtalo de nuevo.' : ex.message; err.hidden = false; busy(btn, false); pass.select(); }
  } },
    field({ id: 'login-email', label: 'Correo electrónico', control: email, required: true }),
    field({ id: 'login-password', label: 'Contraseña', control: pass, required: true }),
    err, btn);
  const next = location.hash.startsWith('#/ocurrencia/') ? location.hash : null;
  if (next) sessionStorage.setItem('sisalert_next', next);
  app.replaceChildren(h('div', { class: 'welcome' },
    h('section', { class: 'welcome-hero', 'aria-labelledby': 'bienvenida-t' },
      h('div', { class: 'welcome-logos' },
        h('div', { class: 'logo-chip' }, h('img', { src: 'img/logos/avanzar-diagnostica.svg', alt: 'Avanzar Diagnóstica' })),
        h('div', { class: 'logo-chip' }, h('img', { src: 'img/logos/colsubsidio-salud.svg', alt: 'Colsubsidio Salud' }))),
      h('div', { class: 'welcome-copy' },
        h('h1', { id: 'bienvenida-t' }, 'Cada tarea del laboratorio, a tiempo y con evidencia.'),
        h('p', {}, 'SISALERT te recuerda por correo y WhatsApp las actividades programadas y no se silencia hasta que subas la foto que confirma que quedó hecha.')),
      h('img', { class: 'welcome-rack', src: 'img/forms/rack-bienvenida.svg', alt: '' }),
      h('p', { class: 'propuesto' }, 'Isologos propuestos, no oficiales. Se reemplazan con los oficiales en public/img/logos.')),
    h('main', { class: 'welcome-form-wrap', id: 'bienvenida-main' }, h('div', { class: 'login-card' },
      h('h2', { 'data-testid': 'login-titulo' }, 'Ingresa a tu cuenta'),
      h('p', { style: 'color:var(--texto-suave)' }, 'Usa el correo con el que te registró la administración.'), form))));
  email.focus();
}

function showHelp() {
  const rows = [['N', 'Nueva actividad'], ['/', 'Buscar actividades'], ['g luego p', 'Ir al panel'], ['g luego c', 'Ir al calendario'], ['g luego a', 'Ir a mis actividades'], ['g luego u', 'Ir a usuarios (admin)'], ['?', 'Ver esta ayuda'], ['Esc', 'Cerrar ventana']];
  modal({ title: 'Atajos de teclado', testid: 'modal-atajos', body: h('dl', { class: 'dl' }, rows.map(([k, t]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, t)])) });
}

let gPending = false, gTimer;
document.addEventListener('keydown', (e) => {
  if (!state.user || e.ctrlKey || e.metaKey || e.altKey || hasModal()) return;
  const t = e.target; const typing = t.matches && t.matches('input,textarea,select,[contenteditable]');
  if (typing) return;
  const k = e.key.toLowerCase();
  if (gPending) {
    gPending = false; clearTimeout(gTimer);
    const map = { p: '#/panel', c: '#/calendario', a: '#/actividades', u: isAdmin() ? '#/usuarios' : null };
    if (map[k]) { e.preventDefault(); go(map[k]); }
    return;
  }
  if (k === 'g') { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 1200); }
  else if (k === 'n') { e.preventDefault(); go('#/actividad/nueva'); }
  else if (k === '/') {
    e.preventDefault();
    const focus = () => { const s = $('[data-testid="act-buscar"]'); if (s) { s.focus(); return true; } return false; };
    if (!focus()) { go('#/actividades'); let n = 0; const iv = setInterval(() => { if (focus() || ++n > 30) clearInterval(iv); }, 100); }
  } else if (e.key === '?') { e.preventDefault(); showHelp(); }
});

boot();

document.querySelector('.skip-link').addEventListener('click', (e) => {
  e.preventDefault();
  const m = document.getElementById('main') || document.getElementById('bienvenida-main');
  if (m) { m.setAttribute('tabindex', '-1'); m.focus(); }
});
