import { h, icon, toInputValue, fromInputValue, hoyKey, FRECUENCIAS, CATEGORIAS, listOf, unwrap } from '../util.js';
import { api } from '../api.js';
import { state, isAdmin, go } from '../state.js';
import { field, setError, focusFirstError, busy, toast, confirmar, errorBox } from '../ui.js';

export async function actividadForm(c, id, params) {
  let a = {};
  let users = [];
  if (id) a = unwrap(await api('/actividades/' + id), 'actividad');
  if (isAdmin()) users = listOf(await api('/usuarios'), 'usuarios').filter((u) => u.activo !== false);
  const me = state.user;
  const fechaQ = params.get('fecha');
  const defIni = a.fecha_inicio ? toInputValue(a.fecha_inicio) : `${fechaQ && /^\d{4}-\d{2}-\d{2}$/.test(fechaQ) ? fechaQ : hoyKey()}T08:00`;

  const titulo = h('input', { type: 'text', id: 'act-titulo', maxlength: '140', 'data-testid': 'act-titulo', value: a.titulo || '', autocomplete: 'off' });
  const desc = h('textarea', { id: 'act-descripcion', 'data-testid': 'act-descripcion', maxlength: '1000' }, a.descripcion || '');
  const cat = h('select', { id: 'act-categoria', 'data-testid': 'act-categoria', onchange: () => setCatImg() }, CATEGORIAS.map(([v, t]) => h('option', { value: v, selected: (a.categoria || 'cultivos') === v }, t)));
  const fecha = h('input', { type: 'datetime-local', id: 'act-fecha', 'data-testid': 'act-fecha', value: defIni });
  const fin = h('input', { type: 'date', id: 'act-fecha-fin', 'data-testid': 'act-fecha-fin', value: a.fecha_fin ? String(a.fecha_fin).slice(0, 10) : '' });
  const resp = h('select', { id: 'act-responsable', 'data-testid': 'act-responsable', disabled: !isAdmin() },
    isAdmin() ? [h('option', { value: '' }, 'Selecciona una persona'), users.map((u) => h('option', { value: u.id, selected: String(a.responsable_id || '') === String(u.id) || (!a.id && !a.responsable_id && u.id === me.id && false) }, u.nombre))]
      : h('option', { value: me.id, selected: true }, me.nombre));
  const catImg = h('img', { alt: '' });
  const setCatImg = () => { catImg.src = `img/forms/cat-${cat.value}.svg`; };
  setCatImg();

  const freqVal = a.frecuencia || 'unica';
  const freqSet = h('fieldset', { class: 'freqs', 'data-testid': 'act-frecuencia', 'aria-describedby': 'act-frecuencia-err' },
    FRECUENCIAS.map(([v, t]) => h('label', { class: 'freq', 'data-testid': 'act-frecuencia-' + v },
      h('input', { type: 'radio', name: 'frecuencia', value: v, checked: v === freqVal, required: true }), h('img', { src: `img/forms/freq-${v}.svg`, alt: '' }), t)));

  const alertBox = h('div', { class: 'alert-box', role: 'alert', hidden: true, 'data-testid': 'act-error' });
  const guardar = h('button', { class: 'btn btn-primary', type: 'submit', 'data-testid': 'act-guardar' }, id ? 'Guardar cambios' : 'Crear actividad');
  const row = (img, el) => h('div', { class: 'frow' }, h('div', { class: 'illo' }, img), el);
  const imgOf = (n) => h('img', { src: `img/forms/${n}.svg`, alt: '' });

  const form = h('form', { novalidate: true, 'data-testid': 'act-form', onsubmit: async (e) => {
    e.preventDefault(); alertBox.hidden = true;
    const ids = ['act-titulo', 'act-fecha', 'act-responsable', 'act-fecha-fin']; ids.forEach((i) => setError(form, i, ''));
    setError(form, 'act-frecuencia', '');
    let bad = false; const E = (i, m) => { setError(form, i, m); bad = true; };
    if (!titulo.value.trim()) E('act-titulo', 'Escribe un título para la actividad.');
    if (!fecha.value) E('act-fecha', 'Elige la fecha y hora de vencimiento.');
    if (isAdmin() && !resp.value) E('act-responsable', 'Selecciona quién es la persona responsable.');
    if (fin.value && fecha.value && fin.value < fecha.value.slice(0, 10)) E('act-fecha-fin', 'La fecha final no puede ser anterior a la fecha de inicio.');
    if (bad) return focusFirstError(form);
    const frecuencia = form.querySelector('input[name=frecuencia]:checked').value;
    const body = { titulo: titulo.value.trim(), descripcion: desc.value.trim(), categoria: cat.value, frecuencia, fecha_inicio: fromInputValue(fecha.value), fecha_fin: fin.value || null,
      responsable_id: isAdmin() ? Number(resp.value) : me.id };
    busy(guardar, true, 'Guardando…');
    try {
      await api(id ? '/actividades/' + id : '/actividades', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'Cambios guardados' : 'Actividad creada. Se programaron sus repeticiones.');
      go('#/actividades');
    } catch (ex) { alertBox.textContent = ex.message; alertBox.hidden = false; busy(guardar, false); alertBox.scrollIntoView({ block: 'nearest' }); }
  } },
    alertBox,
    row(imgOf('field-titulo'), field({ id: 'act-titulo', label: 'Título', control: titulo, required: true, hint: 'Por ejemplo: Calibración del BACTEC FX.' })),
    row(imgOf('field-descripcion'), field({ id: 'act-descripcion', label: 'Descripción', control: desc, hint: 'Pasos o aclaraciones para quien debe hacerla (opcional).' })),
    row(catImg, field({ id: 'act-categoria', label: 'Categoría', control: cat })),
    row(imgOf('field-fecha'), field({ id: 'act-fecha', label: 'Vence el (hora de Bogotá)', control: fecha, required: true, hint: 'Las alertas empiezan 3 días antes y, el día del vencimiento, se repiten cada 30 minutos hasta subir la foto.' })),
    row(imgOf('field-responsable'), field({ id: 'act-responsable', label: 'Responsable', control: resp, required: true, hint: isAdmin() ? 'Recibirá las alertas por correo y WhatsApp.' : 'Las actividades que creas quedan asignadas a ti.' })),
    row(imgOf('field-frecuencia'), h('div', { class: 'field' }, h('div', { class: 'lbl', id: 'freq-lbl' }, 'Frecuencia ', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')), (freqSet.setAttribute('aria-labelledby', 'freq-lbl'), freqSet), h('div', { class: 'err', id: 'act-frecuencia-err', hidden: true }))),
    row(imgOf('field-fecha-fin'), field({ id: 'act-fecha-fin', label: 'Repetir hasta (opcional)', control: fin, hint: 'Déjalo vacío para que se repita sin fecha final.' })),
    h('div', { class: 'form-actions' },
      id && isAdmin() ? h('button', { class: 'btn btn-peligro push', type: 'button', 'data-testid': 'act-eliminar', onclick: async () => {
        if (!(await confirmar({ title: 'Eliminar actividad', text: `Se eliminará «${a.titulo}» con todas sus repeticiones y evidencias. Esta acción no se puede deshacer.` }))) return;
        try { await api('/actividades/' + id, { method: 'DELETE' }); toast('Actividad eliminada'); go('#/actividades'); } catch (e) { toast(e.message, 'error'); } } }, icon('trash'), 'Eliminar actividad') : null,
      h('a', { class: 'btn', href: '#/actividades', 'data-testid': 'act-cancelar' }, 'Cancelar'), guardar));

  c.replaceChildren(h('div', { class: 'card form-card' },
    h('div', { class: 'form-logos' }, h('img', { src: 'img/logos/avanzar-diagnostica.svg', alt: 'Avanzar Diagnóstica' }), h('img', { src: 'img/logos/colsubsidio-salud.svg', alt: 'Colsubsidio Salud' })),
    h('h1', {}, id ? 'Editar actividad' : 'Nueva actividad'),
    h('p', { style: 'color:var(--texto-suave)' }, 'Los campos con * son obligatorios.'), form));
}
