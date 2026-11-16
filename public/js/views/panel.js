import { h, icon, fechaHora, estadoOcc, ESTADO_TXT, listOf } from '../util.js';
import { api } from '../api.js';
import { state, go } from '../state.js';
import { empty } from '../ui.js';

export async function panel(c) {
  const r = await api('/resumen');
  const prox = listOf(r.proximas, 'proximas');
  const stat = (cls, n, l, id) => h('div', { class: 'card stat ' + cls, 'data-testid': 'card-' + id }, h('span', { class: 'n', 'data-testid': 'num-' + id }, String(n ?? 0)), h('span', { class: 'l' }, l));
  const primero = (state.user.nombre || '').split(' ')[0];
  c.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Hola, ' + primero), h('p', {}, r.vencidas > 0 ? `Tienes ${r.vencidas} ${r.vencidas === 1 ? 'actividad vencida' : 'actividades vencidas'}. Sube la foto para dejar de recibir alertas.` : 'Este es el estado de las actividades del laboratorio.'))),
    h('div', { class: 'cards' }, stat('pendientes', r.pendientes, 'Pendientes', 'pendientes'), stat('vencidas', r.vencidas, 'Vencidas', 'vencidas'), stat('cumplidas', r.cumplidas_mes, 'Cumplidas este mes', 'cumplidas')),
    h('h2', {}, 'Próximas actividades'),
    prox.length ? h('ul', { class: 'list', 'data-testid': 'lista-proximas' }, prox.map((o) => {
      const e = estadoOcc(o);
      return h('li', { class: 'item ' + e, 'data-testid': 'proxima-item' },
        h('div', { class: 'grow' }, h('span', { class: 't' }, o.titulo), h('span', { class: 'm' }, fechaHora(o.vence_en) + (o.responsable_nombre ? ' · ' + o.responsable_nombre : ''))),
        h('span', { class: 'badge ' + e }, ESTADO_TXT[e]),
        h('a', { class: 'btn btn-sm', href: '#/ocurrencia/' + o.id, 'data-testid': 'proxima-abrir' }, e === 'cumplida' ? 'Ver' : 'Marcar como realizada'));
    })) : empty({ img: 'img/forms/cat-calidad.svg', title: 'No hay actividades próximas', text: 'Programa la primera actividad para empezar a recibir alertas por correo y WhatsApp.', action: h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'empty-nueva', onclick: () => go('#/actividad/nueva') }, icon('plus'), 'Crear actividad') }));
}
