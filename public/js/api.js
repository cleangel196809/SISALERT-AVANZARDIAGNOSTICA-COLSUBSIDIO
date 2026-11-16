export class ApiError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const POR_ESTADO = {
  400: 'Revisa los datos ingresados e inténtalo de nuevo.',
  401: 'Tu sesión terminó. Inicia sesión de nuevo.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos lo que buscas. Puede que ya no exista.',
  409: 'Ya existe un registro con esos datos.',
  413: 'El archivo es demasiado grande. El máximo es 6 MB.',
  429: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
};

export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (form) opt.body = form;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opt); }
  catch { throw new ApiError('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.', 0); }
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* no JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError((data && data.error) || POR_ESTADO[res.status] || 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.', res.status);
  }
  return data;
}
export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
};
