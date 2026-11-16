import { h, icon, $$ } from './util.js';

export function toast(msg, tipo = 'ok') {
  const t = h('div', { class: 'toast' + (tipo === 'error' ? ' error' : ''), 'data-testid': 'toast', role: tipo === 'error' ? 'alert' : null }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 8000 : 4500);
}

export const spinner = (txt = 'Cargando…') => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spin' }), txt);
export const errorBox = (msg, retry) => h('div', { class: 'alert-box', role: 'alert', 'data-testid': 'error-box' }, msg,
  retry ? [' ', h('button', { class: 'btn btn-sm', type: 'button', onclick: retry }, 'Reintentar')] : null);

export function empty({ img = 'img/forms/cat-otro.svg', title, text, action }) {
  return h('div', { class: 'empty', 'data-testid': 'empty-state' }, h('img', { src: img, alt: '' }), h('h3', {}, title), h('p', {}, text), action || null);
}

const stack = [];
export const hasModal = () => stack.length > 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function modal({ title, body, testid = 'modal', onClose }) {
  const opener = document.activeElement;
  const id = 'm' + Math.random().toString(36).slice(2, 7);
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove(); stack.splice(stack.indexOf(close), 1);
    if (opener && opener.focus && document.contains(opener)) opener.focus();
    if (onClose) onClose();
  };
  const dlg = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, 'data-testid': testid },
    h('div', { class: 'modal-head' }, h('h2', { id }, title),
      h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Cerrar', 'data-testid': 'modal-cerrar', onclick: close }, '✕')),
    body);
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, dlg);
  function onKey(e) {
    if (stack[stack.length - 1] !== close) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = $$(FOCUSABLE, dlg).filter((x) => x.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !dlg.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  stack.push(close);
  document.body.append(overlay);
  const first = $$(FOCUSABLE, dlg).find((x) => x.getAttribute('data-testid') !== 'modal-cerrar') || dlg.querySelector('button');
  setTimeout(() => first && first.focus(), 0);
  return { close, el: dlg };
}

export function confirmar({ title, text, ok = 'Eliminar', peligro = true }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const m = modal({
      title, testid: 'confirmar', onClose: () => fin(false),
      body: h('div', {}, h('p', {}, text),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn', type: 'button', 'data-testid': 'confirmar-no', onclick: () => m.close() }, 'Cancelar'),
          h('button', { class: 'btn ' + (peligro ? 'btn-rojo' : 'btn-primary'), type: 'button', 'data-testid': 'confirmar-si', onclick: () => { fin(true); m.close(); } }, ok))),
    });
  });
}

// Campo con etiqueta, ayuda y error accesibles
export function field({ id, label, control, hint, required, error }) {
  const wrap = h('div', { class: 'field' + (error ? ' invalid' : ''), 'data-field': id });
  const desc = [];
  wrap.append(h('label', { for: id }, label, required ? [' ', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')] : null));
  wrap.append(control);
  if (hint) { wrap.append(h('span', { class: 'hint', id: id + '-hint' }, hint)); desc.push(id + '-hint'); }
  wrap.append(h('div', { class: 'err', id: id + '-err', hidden: true, 'data-testid': id + '-error' }));
  desc.push(id + '-err');
  control.setAttribute('aria-describedby', desc.join(' '));
  if (required) control.setAttribute('aria-required', 'true');
  return wrap;
}
export function setError(root, id, msg) {
  const w = root.querySelector(`[data-field="${id}"]`); if (!w) return;
  const e = w.querySelector('.err'); const c = w.querySelector('input,select,textarea');
  w.classList.toggle('invalid', !!msg); e.hidden = !msg; e.textContent = msg ? '⚠ ' + msg : '';
  if (c) c.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
export function focusFirstError(root) {
  const w = root.querySelector('.field.invalid'); const c = w && w.querySelector('input,select,textarea'); if (c) c.focus();
}
export function busy(btn, on, txt) {
  if (on) { btn.dataset.txt = btn.textContent; btn.setAttribute('aria-busy', 'true'); btn.disabled = true; if (txt) btn.textContent = txt; }
  else { btn.removeAttribute('aria-busy'); btn.disabled = false; if (btn.dataset.txt) btn.textContent = btn.dataset.txt; }
}
export const iconBtnLabel = (name, text) => [icon(name), text];

export function ayudaCallMeBot() {
  return h('details', { class: 'ayuda', 'data-testid': 'ayuda-callmebot' },
    h('summary', {}, 'Cómo activar las alertas de WhatsApp (CallMeBot)'),
    h('ol', {},
      h('li', {}, 'Guarda en tu teléfono el contacto de CallMeBot: ', h('strong', {}, '+34 644 51 95 23'), ' (confirma el número vigente en callmebot.com).'),
      h('li', {}, 'Desde el WhatsApp de la persona responsable, envía a ese contacto este mensaje exacto: ', h('span', { class: 'mono' }, 'I allow callmebot to send me messages')),
      h('li', {}, 'En unos minutos recibirás la respuesta con tu apikey (un número de varios dígitos).'),
      h('li', {}, 'Escribe aquí el WhatsApp con indicativo y sin signos (por ejemplo 573001234567) y pega la apikey.'),
      h('li', {}, 'Guarda y usa «Probar alerta» para confirmar que llega el mensaje.')));
}
