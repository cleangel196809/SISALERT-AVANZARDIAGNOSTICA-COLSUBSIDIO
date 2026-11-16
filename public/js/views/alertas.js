import { h, fechaHora, listOf } from '../util.js';
import { api } from '../api.js';
import { isAdmin } from '../state.js';
import { empty } from '../ui.js';
import { tipoTxt } from './ocurrencia.js';

export async function alertas(c) {
  const data = listOf(await api('/alertas'), 'alertas');
  const fc = { canal: '', ok: '' };
  const host = h('div');
  const mk = (id, label, opts, key) => h('div', { class: 'field' }, h('label', { for: id }, label), h('select', { id, 'data-testid': id, onchange: (e) => { fc[key] = e.target.value; draw(); } }, opts.map(([v, t]) => h('option', { value: v }, t))));
  c.replaceChildren(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Registro de alertas'), h('p', {}, isAdmin() ? 'Todos los envíos por correo y WhatsApp.' : 'Los envíos que te ha hecho el sistema.'))),
    h('div', { class: 'toolbar' }, mk('filtro-canal', 'Canal', [['', 'Todos'], ['correo', 'Correo'], ['whatsapp', 'WhatsApp']], 'canal'), mk('filtro-resultado', 'Resultado', [['', 'Todos'], ['1', 'Enviadas'], ['0', 'Con falla']], 'ok')), host);
  function draw() {
    const rows = data.filter((l) => (!fc.canal || l.canal === fc.canal) && (!fc.ok || String(l.ok ? 1 : 0) === fc.ok));
    if (!rows.length) return host.replaceChildren(empty({ img: 'img/forms/cat-otro.svg', title: data.length ? 'Ningún envío coincide' : 'Aún no se han enviado alertas', text: data.length ? 'Cambia los filtros para ver más envíos.' : 'Cuando una actividad se acerque a su fecha, los envíos aparecerán aquí.' }));
    host.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { 'data-testid': 'tabla-alertas' }, h('caption', {}, `${rows.length} envíos`),
      h('thead', {}, h('tr', {}, ['Fecha de envío', 'Actividad', 'Aviso', 'Canal', 'Destino', 'Resultado'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows.map((l) => h('tr', { 'data-testid': 'alerta-fila' }, h('td', {}, fechaHora(l.enviado_en)), h('td', {}, h('a', { href: '#/ocurrencia/' + l.ocurrencia_id }, l.titulo || 'Ocurrencia ' + l.ocurrencia_id)), h('td', {}, tipoTxt(l.tipo)),
        h('td', {}, l.canal === 'correo' ? 'Correo' : 'WhatsApp'), h('td', {}, l.destino || '—'), h('td', {}, h('span', { class: 'badge ' + (l.ok ? 'cumplida' : 'vencida'), title: l.detalle || '' }, l.ok ? 'Enviada' : 'Falló' + (l.detalle ? ': ' + String(l.detalle).slice(0, 60) : '')))))))));
  }
  draw();
}
