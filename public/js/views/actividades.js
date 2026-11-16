import { h, icon, fechaHora, estadoOcc, ESTADO_TXT, frecLabel, FRECUENCIAS, CATEGORIAS, hoyKey, addDays, listOf } from '../util.js';
import { api, qs } from '../api.js';
import { state, isAdmin, go } from '../state.js';
import { empty, confirmar, toast, errorBox, spinner } from '../ui.js';

let tab = 'ocurrencias';
const f = { q: '', estado: '', frec: '', resp: '' };

export async function actividades(c) {
  let users = [];
  if (isAdmin()) { try { users = listOf(await api('/usuarios'), 'usuarios'); } catch { /* */ } }
  const host = h('div', { 'data-testid': 'act-lista-host' });
  const inputQ = h('input', { type: 'search', id: 'act-buscar', 'data-testid': 'act-buscar', placeholder: 'Título o responsable', value: f.q, 'aria-keyshortcuts': '/', oninput: (e) => { f.q = e.target.value; draw(); } });
  const mk = (id, label, ctl) => h('div', { class: 'field' }, h('label', { for: id }, label), ctl);
  const selEstado = h('select', { id: 'f-estado', 'data-testid': 'filtro-estado', onchange: (e) => { f.estado = e.target.value; load(); } }, [['', 'Todos'], ['pendiente', 'Pendientes'], ['vencida', 'Vencidas'], ['cumplida', 'Cumplidas']].map(([v, t]) => h('option', { value: v, selected: v === f.estado }, t)));
  const selFrec = h('select', { id: 'f-frec', 'data-testid': 'filtro-frecuencia', onchange: (e) => { f.frec = e.target.value; draw(); } }, h('option', { value: '' }, 'Todas'), FRECUENCIAS.map(([v, t]) => h('option', { value: v, selected: v === f.frec }, t)));
  const selResp = isAdmin() ? h('select', { id: 'f-resp', 'data-testid': 'filtro-responsable', onchange: (e) => { f.resp = e.target.value; load(); } }, h('option', { value: '' }, 'Todas las personas'), users.map((u) => h('option', { value: u.id, selected: String(u.id) === f.resp }, u.nombre))) : null;
  const tbOcc = h('button', { class: 'tab', role: 'tab', id: 'tab-occ', 'aria-controls': 'tabpanel', 'data-testid': 'tab-ocurrencias', onclick: () => setTab('ocurrencias') }, 'Programadas');
  const tbAct = h('button', { class: 'tab', role: 'tab', id: 'tab-act', 'aria-controls': 'tabpanel', 'data-testid': 'tab-actividades', onclick: () => setTab('actividades') }, 'Definiciones');
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Vista', onkeydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setTab(tab === 'ocurrencias' ? 'actividades' : 'ocurrencias'); (tab === 'ocurrencias' ? tbOcc : tbAct).focus(); } } }, tbOcc, tbAct);
  const wEstado = mk('f-estado', 'Estado', selEstado), wFrec = mk('f-frec', 'Frecuencia', selFrec);
  c.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Mis actividades'), h('p', {}, isAdmin() ? 'Todas las actividades del laboratorio.' : 'Las actividades que tienes asignadas.')),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'act-nueva', onclick: () => go('#/actividad/nueva') }, icon('plus'), 'Nueva actividad')),
    tabs,
    h('div', { class: 'toolbar' }, h('div', { class: 'field grow' }, h('label', { for: 'act-buscar' }, 'Buscar ', h('kbd', {}, '/')), inputQ), wEstado, wFrec, selResp ? mk('f-resp', 'Responsable', selResp) : null),
    h('div', { id: 'tabpanel', role: 'tabpanel' }, host));

  function setTab(t) { tab = t; load(); }
  async function load() {
    tbOcc.setAttribute('aria-selected', tab === 'ocurrencias'); tbAct.setAttribute('aria-selected', tab === 'actividades');
    tbOcc.tabIndex = tab === 'ocurrencias' ? 0 : -1; tbAct.tabIndex = tab === 'actividades' ? 0 : -1;
    wEstado.hidden = tab !== 'ocurrencias'; wFrec.hidden = false;
    host.replaceChildren(spinner());
    try {
      if (tab === 'ocurrencias') data = listOf(await api('/ocurrencias' + qs({ desde: addDays(hoyKey(), -90), hasta: addDays(hoyKey(), 180), responsable: f.resp })), 'ocurrencias');
      else data = listOf(await api('/actividades' + qs({ responsable: f.resp })), 'actividades');
    } catch (e) { host.replaceChildren(errorBox(e.message, load)); return; }
    draw();
  }
  let data = [];
  function draw() {
    const q = f.q.trim().toLowerCase(); const now = Date.now();
    let rows = data.filter((x) => !q || (x.titulo || '').toLowerCase().includes(q) || (x.responsable_nombre || '').toLowerCase().includes(q));
    if (tab === 'ocurrencias') {
      if (f.estado) rows = rows.filter((o) => estadoOcc(o, now) === f.estado);
      if (f.frec) rows = rows.filter((o) => !o.frecuencia || o.frecuencia === f.frec);
      rows.sort((a, b) => new Date(a.vence_en) - new Date(b.vence_en));
    } else if (f.frec) rows = rows.filter((a) => a.frecuencia === f.frec);
    if (!rows.length) {
      host.replaceChildren(empty({ img: 'img/forms/cat-documentos.svg', title: data.length ? 'Ninguna actividad coincide' : 'Aún no hay actividades', text: data.length ? 'Cambia o limpia los filtros para ver más resultados.' : 'Crea una actividad y el sistema generará las fechas de cada repetición.',
        action: data.length ? h('button', { class: 'btn', type: 'button', onclick: () => { Object.assign(f, { q: '', estado: '', frec: '', resp: '' }); actividades(c); } }, 'Limpiar filtros') : h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('#/actividad/nueva') }, 'Crear actividad') }));
      return;
    }
    host.replaceChildren(h('ul', { class: 'list', 'data-testid': tab === 'ocurrencias' ? 'lista-ocurrencias' : 'lista-actividades' }, rows.map(tab === 'ocurrencias' ? rowOcc : rowAct)));
  }
  const rowOcc = (o) => { const e = estadoOcc(o); return h('li', { class: 'item ' + e, 'data-testid': 'ocurrencia-item' },
    h('div', { class: 'grow' }, h('a', { class: 't', href: '#/ocurrencia/' + o.id }, o.titulo), h('span', { class: 'm' }, fechaHora(o.vence_en) + (o.responsable_nombre ? ' · ' + o.responsable_nombre : ''))),
    h('span', { class: 'badge ' + e }, ESTADO_TXT[e]), h('a', { class: 'btn btn-sm', href: '#/ocurrencia/' + o.id }, e === 'cumplida' ? 'Ver evidencia' : 'Marcar como realizada')); };
  const rowAct = (a) => h('li', { class: 'item' + (a.activa === false ? ' cumplida' : ''), 'data-testid': 'actividad-item', 'data-id': a.id },
    h('div', { class: 'grow' }, h('a', { class: 't', href: '#/actividad/' + a.id }, a.titulo), h('span', { class: 'm' }, `${frecLabel(a.frecuencia)} · desde ${fechaHora(a.fecha_inicio)}${a.responsable_nombre ? ' · ' + a.responsable_nombre : ''}`)),
    a.categoria ? h('span', { class: 'badge' }, (CATEGORIAS.find((x) => x[0] === a.categoria) || [, a.categoria])[1]) : null,
    h('div', { class: 'actions' }, h('a', { class: 'btn btn-sm', href: '#/actividad/' + a.id, 'data-testid': 'act-editar-' + a.id }, icon('edit'), 'Editar'),
      isAdmin() ? h('button', { class: 'btn btn-sm btn-peligro', type: 'button', 'data-testid': 'act-eliminar-' + a.id, onclick: async () => {
        if (!(await confirmar({ title: 'Eliminar actividad', text: `Se eliminará «${a.titulo}» con todas sus repeticiones y evidencias. Esta acción no se puede deshacer.` }))) return;
        try { await api('/actividades/' + a.id, { method: 'DELETE' }); toast('Actividad eliminada'); load(); } catch (e) { toast(e.message, 'error'); } } }, icon('trash'), 'Eliminar') : null));
  await load();
}
