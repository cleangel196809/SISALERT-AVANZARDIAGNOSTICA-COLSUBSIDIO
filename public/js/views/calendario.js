import { h, icon, $$, hoyKey, addDays, dowMon, keyToDate, dayKey, hora, fechaHora, estadoOcc, ESTADO_TXT, MESES, DIAS, listOf } from '../util.js';
import { api, qs } from '../api.js';
import { state, isAdmin, go } from '../state.js';
import { spinner, errorBox, empty } from '../ui.js';

const view = { modo: 'mes', cur: hoyKey(), resp: '' };
const abbr = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export async function calendario(c) {
  let users = [];
  if (isAdmin()) { try { users = listOf(await api('/usuarios'), 'usuarios'); } catch { /* sin filtro */ } }
  const host = h('div');
  const titulo = h('h2', { 'data-testid': 'cal-titulo', 'aria-live': 'polite' });
  const shift = (n) => { view.cur = view.modo === 'mes' ? monthShift(view.cur, n) : addDays(view.cur, 7 * n); draw(); };
  const btn = (txt, label, tid, fn) => h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': label, 'data-testid': tid, onclick: fn }, txt);
  const segMes = h('button', { type: 'button', 'data-testid': 'cal-vista-mes', onclick: () => { view.modo = 'mes'; draw(); } }, 'Mes');
  const segSem = h('button', { type: 'button', 'data-testid': 'cal-vista-semana', onclick: () => { view.modo = 'semana'; draw(); } }, 'Semana');
  const sel = isAdmin() ? h('select', { 'aria-label': 'Filtrar por responsable', 'data-testid': 'cal-filtro-responsable', onchange: (e) => { view.resp = e.target.value; draw(); } },
    h('option', { value: '' }, 'Todas las personas'), users.map((u) => h('option', { value: u.id, selected: String(u.id) === String(view.resp) }, u.nombre))) : null;
  c.replaceChildren(
    h('div', { class: 'page-head' }, h('h1', {}, 'Calendario'), h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'cal-nueva', onclick: () => go('#/actividad/nueva?fecha=' + view.cur) }, icon('plus'), 'Nueva actividad'))),
    h('div', { class: 'cal-head' }, btn(icon('left'), 'Anterior', 'cal-prev', () => shift(-1)), btn(icon('right'), 'Siguiente', 'cal-next', () => shift(1)),
      h('button', { class: 'btn', type: 'button', 'data-testid': 'cal-hoy', onclick: () => { view.cur = hoyKey(); draw(); } }, 'Hoy'), titulo,
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Vista' }, segMes, segSem), sel),
    host);

  async function draw(focusKey) {
    segMes.setAttribute('aria-pressed', view.modo === 'mes'); segSem.setAttribute('aria-pressed', view.modo === 'semana');
    const { start, days } = range();
    const [y, m] = view.cur.split('-').map(Number);
    titulo.textContent = view.modo === 'mes' ? `${MESES[m - 1]} ${y}` : `${fmtShort(days[0])} – ${fmtShort(days[6])} ${keyToDate(days[6]).getUTCFullYear()}`;
    host.replaceChildren(spinner());
    let occ;
    try { occ = listOf(await api('/ocurrencias' + qs({ desde: days[0], hasta: addDays(days[days.length - 1], 1), responsable: view.resp })), 'ocurrencias'); }
    catch (e) { host.replaceChildren(errorBox(e.message, () => draw())); return; }
    const by = {};
    occ.forEach((o) => (by[dayKey(o.vence_en)] ||= []).push(o));
    Object.values(by).forEach((a) => a.sort((p, q) => new Date(p.vence_en) - new Date(q.vence_en)));
    const hoy = hoyKey(); const sem = view.modo === 'semana';
    const rows = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    const cell = (k) => {
      const list = by[k] || []; const max = sem ? 99 : 3;
      const d = keyToDate(k);
      return h('div', { class: 'cal-cell' + (k === hoy ? ' hoy' : '') + (!sem && k.slice(0, 7) !== view.cur.slice(0, 7) ? ' fuera' : ''), role: 'gridcell', 'data-testid': 'cal-celda-' + k },
        h('button', { class: 'cal-day', type: 'button', 'data-key': k, tabindex: k === (focusKey || view.cur) ? '0' : '-1', 'data-testid': 'cal-dia-' + k,
          'aria-label': `${DIAS[dowMon(k)]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${list.length ? ', ' + list.length + (list.length === 1 ? ' actividad' : ' actividades') : ''}. Crear actividad`,
          onclick: () => go('#/actividad/nueva?fecha=' + k) }, String(d.getUTCDate())),
        list.slice(0, max).map((o) => { const e = estadoOcc(o); return h('a', { class: 'chip ' + e, href: '#/ocurrencia/' + o.id, 'data-testid': 'cal-ocurrencia-' + o.id, title: `${o.titulo} (${ESTADO_TXT[e]}, ${hora(o.vence_en)})` }, (e === 'cumplida' ? '✓ ' : e === 'vencida' ? '! ' : '') + hora(o.vence_en) + ' ' + o.titulo); }),
        list.length > max ? h('button', { class: 'cal-more', type: 'button', onclick: () => { view.modo = 'semana'; view.cur = k; draw(); } }, `+${list.length - max} más`) : null);
    };
    const grid = h('div', { class: 'cal' + (sem ? ' semana' : ''), role: 'grid', 'aria-label': titulo.textContent, 'data-testid': 'cal-grid',
      onkeydown: (e) => {
        const b = e.target.closest && e.target.closest('.cal-day'); if (!b) return;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (step) { e.preventDefault(); const nk = addDays(b.dataset.key, step); const nb = grid.querySelector(`[data-key="${nk}"]`); if (nb) { b.tabIndex = -1; nb.tabIndex = 0; nb.focus(); } }
      } },
      h('div', { class: 'cal-row cal-dow-row', role: 'row' }, DIAS.map((d, i) => h('div', { class: 'cal-dow', role: 'columnheader', 'aria-label': d }, h('span', { class: 'l' }, d.slice(0, 3)), h('span', { class: 's', 'aria-hidden': 'true' }, abbr[i])))),
      rows.map((r) => h('div', { class: 'cal-row', role: 'row' }, r.map(cell))));
    // abreviatura corta en móvil
    const agenda = occ.slice().sort((p, q) => new Date(p.vence_en) - new Date(q.vence_en));
    host.replaceChildren(grid,
      h('div', { class: 'legend', 'aria-hidden': 'true' }, [['var(--azul)', 'Pendiente'], ['var(--rojo)', 'Vencida'], ['var(--verde)', 'Cumplida']].map(([c2, t]) => h('span', {}, h('i', { style: 'background:' + c2 }), t))),
      h('section', { class: 'agenda', 'aria-label': 'Agenda del periodo' }, h('h2', {}, 'Agenda del periodo'),
        agenda.length ? h('ul', { class: 'list', 'data-testid': 'cal-agenda' }, agenda.map((o) => { const e = estadoOcc(o); return h('li', { class: 'item ' + e }, h('div', { class: 'grow' }, h('a', { class: 't', href: '#/ocurrencia/' + o.id }, o.titulo), h('span', { class: 'm' }, fechaHora(o.vence_en) + (o.responsable_nombre ? ' · ' + o.responsable_nombre : ''))), h('span', { class: 'badge ' + e }, ESTADO_TXT[e])); }))
          : empty({ img: 'img/forms/field-fecha.svg', title: 'Sin actividades en este periodo', text: 'Haz clic en un día del calendario para programar una actividad.' })));
    if (focusKey) { const b = grid.querySelector(`[data-key="${focusKey}"]`); if (b) b.focus(); }
  }
  await draw();
}

function monthShift(k, n) { const [y, m] = k.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); }
function fmtShort(k) { const d = keyToDate(k); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`; }
function range() {
  if (view.modo === 'semana') { const s = addDays(view.cur, -dowMon(view.cur)); return { start: s, days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) }; }
  const first = view.cur.slice(0, 8) + '01'; const s = addDays(first, -dowMon(first));
  return { start: s, days: Array.from({ length: 42 }, (_, i) => addDays(s, i)) };
}
