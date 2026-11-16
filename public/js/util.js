// Utilidades: DOM, fechas (zona America/Bogota, sin horario de verano: UTC-5)
export const TZ = 'America/Bogota';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 010 7M22 20c0-3-2-5-5-5.7"/>',
  bell: '<path d="M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21h4"/>',
  logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.500 2-2.500 3.500M12 17h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};
export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico');
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.innerHTML = ICONS[name] || '';
  return s;
}

const fmt = (opts) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, ...opts });
const F_FULL = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const F_DATE = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const F_TIME = fmt({ hour: 'numeric', minute: '2-digit' });
const F_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const F_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const fechaHora = (iso) => (iso ? F_FULL.format(new Date(iso)) : '—');
export const fecha = (iso) => (iso ? F_DATE.format(new Date(iso)) : '—');
export const hora = (iso) => F_TIME.format(new Date(iso));
export const dayKey = (d) => F_KEY.format(d instanceof Date ? d : new Date(d));
export const hoyKey = () => dayKey(new Date());
export function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function addDays(k, n) { const d = keyToDate(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const dowMon = (k) => (keyToDate(k).getUTCDay() + 6) % 7; // 0 = lunes
export function toInputValue(iso) {
  const p = Object.fromEntries(F_PARTS.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const fromInputValue = (v) => `${v}:00-05:00`;
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export const FRECUENCIAS = [
  ['unica', 'Única vez'], ['semanal', 'Semanal'], ['mensual', 'Mensual'],
  ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual'],
];
export const frecLabel = (v) => (FRECUENCIAS.find((f) => f[0] === v) || [, v])[1];
export const CATEGORIAS = [
  ['cultivos', 'Hemocultivos y BACTEC'], ['calidad', 'Control de calidad'], ['equipos', 'Mantenimiento de equipos'],
  ['reactivos', 'Reactivos e insumos'], ['bioseguridad', 'Bioseguridad'], ['documentos', 'Documentación y registros'], ['otro', 'Otra'],
];
export const CARGOS = [['bacteriologa', 'Bacterióloga'], ['auxiliar', 'Auxiliar de laboratorio'], ['coordinadora', 'Coordinadora'], ['otro', 'Otro']];
export const cargoLabel = (v) => (CARGOS.find((c) => c[0] === v) || [, v || '—'])[1];
export const listOf = (d, key) => (Array.isArray(d) ? d : (d && d[key]) || []);
export const unwrap = (d, key) => (d && d[key]) || d;

export function estadoOcc(o, now = Date.now()) {
  if (o.estado === 'cumplida') return 'cumplida';
  return new Date(o.vence_en).getTime() < now ? 'vencida' : 'pendiente';
}
export const ESTADO_TXT = { pendiente: 'Pendiente', vencida: 'Vencida', cumplida: 'Cumplida' };
