import { h, icon, fechaHora, estadoOcc, ESTADO_TXT, toInputValue, fromInputValue, frecLabel, listOf, unwrap } from '../util.js';
import { api } from '../api.js';
import { state, isAdmin, go } from '../state.js';
import { field, setError, busy, toast, confirmar } from '../ui.js';

const MAX = 6 * 1024 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export async function ocurrencia(c, id) {
  const o = unwrap(await api('/ocurrencias/' + id), 'ocurrencia');
  const e = estadoOcc(o);
  const puede = isAdmin() || !o.responsable_id || o.responsable_id === state.user.id;
  const head = h('div', { class: 'page-head' }, h('div', {}, h('h1', { 'data-testid': 'ocurrencia-titulo' }, o.titulo || 'Actividad'),
    h('p', {}, h('span', { class: 'badge ' + e, 'data-testid': 'ocurrencia-estado' }, ESTADO_TXT[e]))),
    h('a', { class: 'btn', href: '#/actividades' }, icon('back'), 'Volver'));
  const info = h('dl', { class: 'dl' },
    h('dt', {}, 'Vence'), h('dd', { 'data-testid': 'ocurrencia-vence' }, fechaHora(o.vence_en)),
    o.responsable_nombre ? [h('dt', {}, 'Responsable'), h('dd', {}, o.responsable_nombre)] : null,
    o.frecuencia ? [h('dt', {}, 'Frecuencia'), h('dd', {}, frecLabel(o.frecuencia))] : null,
    o.descripcion ? [h('dt', {}, 'Detalle'), h('dd', {}, o.descripcion)] : null,
    o.estado === 'cumplida' ? [h('dt', {}, 'Cumplida el'), h('dd', {}, fechaHora(o.cumplida_en))] : null);
  const left = h('section', { class: 'card', 'aria-label': 'Detalle' }, h('h2', {}, 'Detalle'), info, o.comentario && o.estado === 'cumplida' ? h('p', {}, h('strong', {}, 'Comentario: '), o.comentario) : null);

  let right;
  if (o.estado === 'cumplida') {
    right = h('section', { class: 'card evidencia', 'aria-label': 'Evidencia' }, h('h2', {}, 'Evidencia'),
      o.tiene_evidencia === false ? h('p', {}, 'Esta actividad no tiene foto guardada.') : h('img', { src: `/api/ocurrencias/${id}/evidencia`, alt: 'Foto de evidencia de la actividad cumplida', 'data-testid': 'ocurrencia-evidencia' }));
  } else if (!puede) {
    right = h('section', { class: 'card' }, h('p', {}, 'Solo la persona responsable o la administración pueden marcar esta actividad como realizada.'));
  } else {
    const file = h('input', { type: 'file', id: 'ocurrencia-foto', accept: 'image/*', capture: 'environment', 'data-testid': 'ocurrencia-foto', 'aria-describedby': 'ocurrencia-foto-hint ocurrencia-foto-err' });
    const prev = h('div', { class: 'preview', 'data-testid': 'ocurrencia-preview-box', hidden: true });
    const errFoto = h('div', { class: 'err', id: 'ocurrencia-foto-err', 'data-testid': 'ocurrencia-foto-error', hidden: true });
    const com = h('textarea', { id: 'ocurrencia-comentario', 'data-testid': 'ocurrencia-comentario', maxlength: '500' });
    const msg = h('div', { class: 'alert-box', role: 'alert', hidden: true, 'data-testid': 'ocurrencia-error' });
    const btn = h('button', { class: 'btn btn-verde', type: 'submit', 'data-testid': 'ocurrencia-cumplir' }, icon('check'), 'Marcar como realizada');
    let url = null;
    const fe = (m) => { errFoto.textContent = m ? '⚠ ' + m : ''; errFoto.hidden = !m; file.setAttribute('aria-invalid', m ? 'true' : 'false'); };
    file.addEventListener('change', () => {
      fe(''); prev.hidden = true; prev.replaceChildren(); if (url) URL.revokeObjectURL(url);
      const f = file.files[0]; if (!f) return;
      if (f.type && !TIPOS.includes(f.type)) { file.value = ''; return fe('Formato no admitido. Usa una foto JPG, PNG, WebP o HEIC.'); }
      if (f.size > MAX) { file.value = ''; return fe('La foto pesa más de 6 MB. Toma una con menor resolución e inténtalo de nuevo.'); }
      url = URL.createObjectURL(f);
      const im = h('img', { src: url, alt: 'Vista previa de la foto que se enviará', 'data-testid': 'ocurrencia-preview' });
      im.onerror = () => { im.replaceWith(h('p', { class: 'alert-box info' }, `No se puede mostrar la vista previa de «${f.name}», pero el archivo está listo para enviarse.`)); };
      prev.append(h('p', { class: 'lbl' }, 'Vista previa antes de enviar'), im, h('button', { class: 'btn btn-sm', type: 'button', style: 'margin-top:.5rem', 'data-testid': 'ocurrencia-quitar-foto', onclick: () => { file.value = ''; prev.hidden = true; prev.replaceChildren(); file.focus(); } }, 'Quitar foto'));
      prev.hidden = false;
    });
    const form = h('form', { novalidate: true, 'data-testid': 'ocurrencia-form', onsubmit: async (ev) => {
      ev.preventDefault(); msg.hidden = true; fe('');
      if (!file.files[0]) { fe('Adjunta una foto como evidencia para marcar la actividad como realizada.'); return file.focus(); }
      const fd = new FormData(); fd.append('evidencia', file.files[0]); fd.append('comentario', com.value.trim());
      busy(btn, true, 'Enviando…');
      try { await api(`/ocurrencias/${id}/cumplir`, { method: 'POST', form: fd }); toast('Actividad marcada como realizada. Se detuvieron las alertas.'); go('#/panel'); }
      catch (ex) { msg.textContent = ex.message; msg.hidden = false; busy(btn, false); }
    } },
      msg,
      h('label', { class: 'dropzone', for: 'ocurrencia-foto' }, h('img', { class: 'illo', src: 'img/forms/field-foto.svg', alt: '' }),
        h('strong', { style: 'display:block;color:var(--azul)' }, 'Toca para tomar o elegir la foto *'), h('span', { class: 'hint', id: 'ocurrencia-foto-hint' }, 'Obligatoria. JPG, PNG, WebP o HEIC de hasta 6 MB.'), file),
      errFoto, prev,
      h('div', { class: 'field', style: 'margin-top:1rem' }, h('label', { for: 'ocurrencia-comentario' }, 'Comentario (opcional)'), com),
      btn);
    right = h('section', { class: 'card', 'aria-label': 'Marcar como realizada' }, h('h2', {}, 'Marcar como realizada'), form);
  }
  const parts = [head, h('div', { class: 'occ' }, left, right)];

  if (isAdmin() || puede) {
    const re = h('input', { type: 'datetime-local', id: 'ocurrencia-nueva-fecha', 'data-testid': 'ocurrencia-nueva-fecha', value: toInputValue(o.vence_en) });
    const adm = [];
    if (o.estado !== 'cumplida') adm.push(h('form', { class: 'toolbar', 'data-testid': 'ocurrencia-reprogramar-form', onsubmit: async (ev) => {
      ev.preventDefault(); if (!re.value) return toast('Elige la nueva fecha y hora.', 'error');
      try { await api('/ocurrencias/' + id, { method: 'PUT', body: { vence_en: fromInputValue(re.value) } }); toast('Fecha reprogramada'); go('#/ocurrencia/' + id); } catch (ex) { toast(ex.message, 'error'); } } },
      h('div', { class: 'field' }, h('label', { for: 'ocurrencia-nueva-fecha' }, 'Reprogramar vencimiento'), re), h('button', { class: 'btn', type: 'submit', 'data-testid': 'ocurrencia-reprogramar' }, 'Reprogramar')));
    if (isAdmin()) adm.push(h('button', { class: 'btn btn-peligro', type: 'button', 'data-testid': 'ocurrencia-eliminar', onclick: async () => {
      if (!(await confirmar({ title: 'Eliminar esta repetición', text: 'Se eliminará esta fecha y su evidencia. Esta acción no se puede deshacer.' }))) return;
      try { await api('/ocurrencias/' + id, { method: 'DELETE' }); toast('Repetición eliminada'); go('#/actividades'); } catch (ex) { toast(ex.message, 'error'); } } }, icon('trash'), 'Eliminar repetición'));
    if (adm.length) parts.push(h('section', { class: 'card', style: 'margin-top:1.25rem', 'aria-label': 'Gestión' }, h('h2', {}, 'Gestión'), adm));
  }
  // Notas de la actividad (todas las personas con acceso pueden leer y agregar)
  {
    const lista = h('ul', { class: 'list', 'data-testid': 'notas-lista' });
    const area = h('textarea', { id: 'nota-texto', 'data-testid': 'nota-texto', maxlength: '2000', placeholder: 'Escribe una nota sobre esta actividad' });
    const pintar = (notas) => {
      lista.replaceChildren(...(notas.length ? notas.map((n) => h('li', { class: 'item', 'data-testid': 'nota-item' },
        h('div', { class: 'grow' }, h('span', { class: 't' }, n.texto || '(sin texto)'),
          h('span', { class: 'm' }, `${n.usuario_nombre || 'Usuario'} · ${fechaHora(n.creado_en)}${n.tipo === 'pendiente' ? ' · marcada pendiente' : ''}`))))
        : [h('li', { class: 'm', 'data-testid': 'notas-vacio' }, 'Aún no hay notas.')]));
    };
    const cargar = async () => { try { pintar(listOf(await api(`/ocurrencias/${id}/notas`), 'notas')); } catch { pintar([]); } };
    const btnNota = h('button', { class: 'btn', type: 'submit', 'data-testid': 'nota-guardar' }, 'Guardar nota');
    const formNota = h('form', { novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); const t = area.value.trim();
      if (!t) { toast('Escribe el texto de la nota.', 'error'); return area.focus(); }
      busy(btnNota, true, 'Guardando…');
      try { await api(`/ocurrencias/${id}/notas`, { method: 'POST', body: { texto: t } }); area.value = ''; toast('Nota guardada'); await cargar(); }
      catch (ex) { toast(ex.message, 'error'); }
      busy(btnNota, false);
    } }, h('div', { class: 'field' }, h('label', { for: 'nota-texto' }, 'Agregar nota'), area), btnNota);
    parts.push(h('section', { class: 'card', style: 'margin-top:1.25rem', 'aria-label': 'Notas', 'data-testid': 'notas' }, h('h2', {}, 'Notas'), lista, formNota));
    cargar();
  }
  if (isAdmin()) {
    let log = [];
    try { log = listOf(await api('/alertas?ocurrencia_id=' + id), 'alertas'); } catch { /* opcional */ }
    parts.push(h('section', { class: 'card', style: 'margin-top:1.25rem', 'aria-label': 'Alertas enviadas' }, h('h2', {}, 'Alertas enviadas'),
      log.length ? h('ul', { class: 'list', 'data-testid': 'ocurrencia-alertas' }, log.map((l) => h('li', { class: 'item ' + (l.ok ? 'cumplida' : 'vencida') }, h('div', { class: 'grow' }, h('span', { class: 't' }, `${l.canal === 'correo' ? 'Correo' : 'WhatsApp'} · ${tipoTxt(l.tipo)}`), h('span', { class: 'm' }, `${fechaHora(l.enviado_en)} · ${l.destino || ''}`)), h('span', { class: 'badge ' + (l.ok ? 'cumplida' : 'vencida') }, l.ok ? 'Enviada' : 'Falló'))))
        : h('p', { style: 'color:var(--texto-suave)' }, 'Todavía no se ha enviado ninguna alerta para esta fecha.')));
  }
  c.replaceChildren(...parts);
}
export const tipoTxt = (t) => ({ d3: '3 días antes', d2: '2 días antes', d1: '1 día antes', dia: 'Día del vencimiento' }[t] || t);
