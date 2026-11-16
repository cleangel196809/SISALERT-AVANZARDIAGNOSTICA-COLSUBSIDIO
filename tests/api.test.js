'use strict';
// Pruebas de API y de la lógica de alertas. Requiere Postgres de pruebas (ver README: tests/start-test-db.sh).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://sisalert:sisalert@127.0.0.1:5433/sisalert';
process.env.JWT_SECRET = 'secreto-de-pruebas';
process.env.MAIL_DRY_RUN = 'true';
process.env.WA_DRY_RUN = 'true';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'ClaveAdmin123';
process.env.CRON_SECRET = 'cron-test';
process.env.APP_URL = 'http://localhost:3000';
delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
delete process.env.NODE_ENV;

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

if (!/(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL) && process.env.ALLOW_TEST_WIPE !== '1') {
  throw new Error('Las pruebas borran datos: use una BD local (o ALLOW_TEST_WIPE=1).');
}

const db = require('../server/db');
const { migrate } = require('../server/migrate');
const { seed } = require('../server/seed');
const { crearApp } = require('../server/app');
const alerts = require('../server/services/alerts');

let server, base;

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function cliente() {
  let cookie = '';
  async function req(method, ruta, { json, form } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(base + ruta, { method, headers, body });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (r) => req('GET', r), post: (r, json) => req('POST', r, { json }), put: (r, json) => req('PUT', r, { json }),
    del: (r) => req('DELETE', r), postForm: (r, form) => req('POST', r, { form }),
    login: async (email, password) => { const r = await req('POST', '/api/auth/login', { json: { email, password } }); return r; },
  };
}

function formFoto(comentario) {
  const f = new FormData();
  f.append('evidencia', new Blob([PNG], { type: 'image/png' }), 'foto.png');
  if (comentario) f.append('comentario', comentario);
  return f;
}

let admin, usuario, usuario2, usuarioId, usuario2Id;

before(async () => {
  await migrate();
  await db.query('TRUNCATE alertas_log, ocurrencias, actividades, usuarios RESTART IDENTITY CASCADE');
  await seed();
  server = crearApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  admin = cliente();
  assert.equal((await admin.login('admin@test.local', 'ClaveAdmin123')).status, 200);
  const u1 = await admin.post('/api/usuarios', { nombre: 'Laura Bacterióloga', email: 'laura@test.local', password: 'Laura12345', cargo: 'bacteriologa', whatsapp: '+57 300 123 4567', callmebot_apikey: '123456' });
  assert.equal(u1.status, 201);
  usuarioId = u1.data.usuario.id;
  const u2 = await admin.post('/api/usuarios', { nombre: 'Aux Dos', email: 'aux@test.local', password: 'Aux1234567', cargo: 'auxiliar' });
  usuario2Id = u2.data.usuario.id;
  usuario = cliente(); usuario2 = cliente();
  assert.equal((await usuario.login('laura@test.local', 'Laura12345')).status, 200);
  assert.equal((await usuario2.login('aux@test.local', 'Aux1234567')).status, 200);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.cerrar();
});

describe('autenticación', () => {
  test('salud', async () => {
    const r = await cliente().get('/api/salud');
    assert.deepEqual(r.data, { ok: true });
  });
  test('login correcto devuelve usuario sin password_hash y fija cookie httpOnly', async () => {
    const c = cliente();
    const r = await c.login('admin@test.local', 'ClaveAdmin123');
    assert.equal(r.status, 200);
    assert.equal(r.data.usuario.rol, 'admin');
    assert.equal(r.data.usuario.password_hash, undefined);
    assert.match(r.headers.get('set-cookie'), /sisalert_token=.*HttpOnly/i);
    assert.equal((await c.get('/api/auth/me')).data.usuario.email, 'admin@test.local');
  });
  test('login incorrecto -> 401; sin sesión -> 401', async () => {
    assert.equal((await cliente().login('admin@test.local', 'mala')).status, 401);
    assert.equal((await cliente().login('nadie@test.local', 'x')).status, 401);
    assert.equal((await cliente().get('/api/auth/me')).status, 401);
    assert.equal((await cliente().get('/api/actividades')).status, 401);
  });
  test('logout invalida la cookie en el cliente', async () => {
    const c = cliente();
    await c.login('admin@test.local', 'ClaveAdmin123');
    const r = await c.post('/api/auth/logout');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie'), /sisalert_token=;.*Expires=Thu, 01 Jan 1970/i);
  });
  test('cambiar clave', async () => {
    const c = cliente();
    await admin.post('/api/usuarios', { nombre: 'Temporal', email: 'tmp@test.local', password: 'Temporal123' });
    await c.login('tmp@test.local', 'Temporal123');
    assert.equal((await c.post('/api/auth/cambiar-clave', { actual: 'incorrecta', nueva: 'Nueva12345' })).status, 400);
    assert.equal((await c.post('/api/auth/cambiar-clave', { actual: 'Temporal123', nueva: 'Nueva12345' })).status, 200);
    assert.equal((await cliente().login('tmp@test.local', 'Nueva12345')).status, 200);
  });
  test('usuario inactivo no puede ingresar', async () => {
    const r = await admin.post('/api/usuarios', { nombre: 'Inactivo', email: 'off@test.local', password: 'Inactivo123', activo: false });
    assert.equal(r.status, 201);
    assert.equal((await cliente().login('off@test.local', 'Inactivo123')).status, 401);
  });
});

describe('permisos', () => {
  test('usuario NO puede crear/editar/borrar usuarios -> 403', async () => {
    assert.equal((await usuario.post('/api/usuarios', { nombre: 'X', email: 'x@test.local', password: 'Xxxxxxxx1' })).status, 403);
    assert.equal((await usuario.put(`/api/usuarios/${usuario2Id}`, { nombre: 'Hack' })).status, 403);
    assert.equal((await usuario.del(`/api/usuarios/${usuario2Id}`)).status, 403);
  });
  test('GET /usuarios: admin ve todo, usuario lista corta', async () => {
    const a = (await admin.get('/api/usuarios')).data.usuarios[0];
    assert.ok('email' in a);
    const u = (await usuario.get('/api/usuarios')).data.usuarios[0];
    assert.deepEqual(Object.keys(u).sort(), ['cargo', 'id', 'nombre']);
  });
  test('usuario NO puede DELETE actividad (403) y admin sí', async () => {
    const c = await usuario.post('/api/actividades', { titulo: 'Calibración', frecuencia: 'unica', fecha_inicio: '2040-01-10T08:00:00-05:00' });
    assert.equal(c.status, 201);
    const id = c.data.actividad.id;
    assert.equal(c.data.actividad.responsable_id, usuarioId);
    assert.equal((await usuario.del(`/api/actividades/${id}`)).status, 403);
    assert.equal((await admin.del(`/api/actividades/${id}`)).status, 200);
    assert.equal((await admin.get(`/api/actividades/${id}`)).status, 404);
  });
  test('usuario: responsable_id forzado a sí mismo; no ve actividades ajenas', async () => {
    const c = await usuario.post('/api/actividades', { titulo: 'Mía', frecuencia: 'unica', fecha_inicio: '2040-02-10T08:00:00-05:00', responsable_id: usuario2Id });
    assert.equal(c.data.actividad.responsable_id, usuarioId);
    const ajena = await admin.post('/api/actividades', { titulo: 'Ajena', frecuencia: 'unica', fecha_inicio: '2040-02-11T08:00:00-05:00', responsable_id: usuario2Id });
    assert.equal(ajena.data.actividad.responsable_id, usuario2Id);
    assert.equal((await usuario.get(`/api/actividades/${ajena.data.actividad.id}`)).status, 403);
    const lista = (await usuario.get('/api/actividades')).data.actividades;
    assert.ok(lista.every((a) => a.responsable_id === usuarioId));
    assert.ok(!lista.some((a) => a.titulo === 'Ajena'));
    assert.equal((await usuario.put(`/api/actividades/${ajena.data.actividad.id}`, { titulo: 'robo' })).status, 403);
  });
  test('usuario edita su actividad pero no cambia responsable', async () => {
    const c = await usuario.post('/api/actividades', { titulo: 'Editable', frecuencia: 'unica', fecha_inicio: '2040-03-10T08:00:00-05:00' });
    const p = await usuario.put(`/api/actividades/${c.data.actividad.id}`, { titulo: 'Editada', responsable_id: usuario2Id });
    assert.equal(p.status, 200);
    assert.equal(p.data.actividad.titulo, 'Editada');
    assert.equal(p.data.actividad.responsable_id, usuarioId);
  });
  test('admin elimina usuario; usuario con actividades -> 409; no puede borrarse a sí mismo', async () => {
    const n = await admin.post('/api/usuarios', { nombre: 'Borrable', email: 'del@test.local', password: 'Borrable123' });
    assert.equal((await admin.del(`/api/usuarios/${n.data.usuario.id}`)).status, 200);
    assert.equal((await admin.del(`/api/usuarios/${usuarioId}`)).status, 409);
    const yo = (await admin.get('/api/auth/me')).data.usuario.id;
    assert.equal((await admin.del(`/api/usuarios/${yo}`)).status, 400);
  });
  test('usuario edita su perfil (PUT /usuarios/yo) con whatsapp solo dígitos', async () => {
    const r = await usuario2.put('/api/usuarios/yo', { nombre: 'Aux Dos B', whatsapp: '+57 (301) 555-0000', callmebot_apikey: '999' });
    assert.equal(r.status, 200);
    assert.equal(r.data.usuario.whatsapp, '573015550000');
  });
  test('DELETE ocurrencia solo admin', async () => {
    const c = await usuario.post('/api/actividades', { titulo: 'Oc', frecuencia: 'unica', fecha_inicio: '2040-04-10T08:00:00-05:00' });
    const det = (await usuario.get(`/api/actividades/${c.data.actividad.id}`)).data;
    const oid = det.ocurrencias[0].id;
    assert.equal((await usuario.del(`/api/ocurrencias/${oid}`)).status, 403);
    assert.equal((await admin.del(`/api/ocurrencias/${oid}`)).status, 200);
  });
});

describe('recurrencia', () => {
  const casos = [['unica', 1], ['semanal', 26], ['mensual', 12], ['trimestral', 8], ['semestral', 4], ['anual', 3]];
  for (const [frecuencia, n] of casos) {
    test(`${frecuencia} genera ${n} ocurrencias`, async () => {
      const r = await admin.post('/api/actividades', { titulo: `Rec ${frecuencia}`, frecuencia, fecha_inicio: '2041-01-15T09:00:00-05:00' });
      assert.equal(r.status, 201);
      assert.equal(r.data.ocurrencias_generadas, n);
      const det = (await admin.get(`/api/actividades/${r.data.actividad.id}`)).data;
      assert.equal(det.ocurrencias.length, n);
    });
  }
  test('semanal: separadas exactamente 7 días; mensual conserva hora local', async () => {
    const s = await admin.post('/api/actividades', { titulo: 'S', frecuencia: 'semanal', fecha_inicio: '2041-01-15T09:00:00-05:00' });
    const o = (await admin.get(`/api/actividades/${s.data.actividad.id}`)).data.ocurrencias;
    assert.equal(new Date(o[1].vence_en) - new Date(o[0].vence_en), 7 * 86400000);
    const m = await admin.post('/api/actividades', { titulo: 'M', frecuencia: 'mensual', fecha_inicio: '2041-01-31T09:00:00-05:00' });
    const om = (await admin.get(`/api/actividades/${m.data.actividad.id}`)).data.ocurrencias;
    assert.equal(om[1].vence_en, '2041-02-28T14:00:00.000Z'); // 31 ene -> 28 feb, 09:00 Bogotá
    assert.equal(om[2].vence_en, '2041-03-31T14:00:00.000Z');
  });
  test('fecha_fin limita las ocurrencias', async () => {
    const r = await admin.post('/api/actividades', { titulo: 'Con fin', frecuencia: 'semanal', fecha_inicio: '2041-01-15T09:00:00-05:00', fecha_fin: '2041-02-12' });
    assert.equal(r.data.ocurrencias_generadas, 5); // 15, 22, 29 ene, 5, 12 feb
  });
  test('fecha sin zona se interpreta como hora de Bogotá', async () => {
    const r = await admin.post('/api/actividades', { titulo: 'Naive', frecuencia: 'unica', fecha_inicio: '2041-05-01T09:00' });
    const o = (await admin.get(`/api/actividades/${r.data.actividad.id}`)).data.ocurrencias[0];
    assert.equal(o.vence_en, '2041-05-01T14:00:00.000Z');
  });
  test('editar regenera pendientes y conserva cumplidas', async () => {
    const r = await admin.post('/api/actividades', { titulo: 'Edit regen', frecuencia: 'mensual', fecha_inicio: '2042-01-10T09:00:00-05:00' });
    const id = r.data.actividad.id;
    const oid = (await admin.get(`/api/actividades/${id}`)).data.ocurrencias[0].id;
    assert.equal((await admin.postForm(`/api/ocurrencias/${oid}/cumplir`, formFoto())).status, 200);
    const p = await admin.put(`/api/actividades/${id}`, { frecuencia: 'trimestral' });
    assert.equal(p.status, 200);
    const det = (await admin.get(`/api/actividades/${id}`)).data.ocurrencias;
    assert.equal(det.filter((x) => x.estado === 'cumplida').length, 1);
    assert.equal(det.length, 8); // 1 cumplida (conflicto con la 1.ª trimestral) + 7 pendientes regeneradas
  });
  test('validaciones de actividad', async () => {
    assert.equal((await admin.post('/api/actividades', { frecuencia: 'unica', fecha_inicio: '2041-01-01' })).status, 400);
    assert.equal((await admin.post('/api/actividades', { titulo: 'x', frecuencia: 'diaria', fecha_inicio: '2041-01-01' })).status, 400);
    assert.equal((await admin.post('/api/actividades', { titulo: 'x', frecuencia: 'unica', fecha_inicio: 'nada' })).status, 400);
  });
});

describe('cumplir con evidencia', () => {
  test('sin foto -> 400; con foto -> 200 y evidencia descargable; segunda vez -> 409', async () => {
    const c = await usuario.post('/api/actividades', { titulo: 'Con foto', frecuencia: 'unica', fecha_inicio: '2043-01-10T08:00:00-05:00' });
    const oid = (await usuario.get(`/api/actividades/${c.data.actividad.id}`)).data.ocurrencias[0].id;
    assert.equal((await usuario.postForm(`/api/ocurrencias/${oid}/cumplir`, new FormData())).status, 400);
    const sinFoto = new FormData(); sinFoto.append('comentario', 'solo texto');
    assert.equal((await usuario.postForm(`/api/ocurrencias/${oid}/cumplir`, sinFoto)).status, 400);
    assert.equal((await usuario.get(`/api/ocurrencias/${oid}`)).data.ocurrencia.estado, 'pendiente');

    const ok = await usuario.postForm(`/api/ocurrencias/${oid}/cumplir`, formFoto('Todo en orden'));
    assert.equal(ok.status, 200);
    assert.equal(ok.data.ocurrencia.estado, 'cumplida');
    assert.equal(ok.data.ocurrencia.tiene_evidencia, true);
    assert.equal(ok.data.ocurrencia.comentario, 'Todo en orden');

    const ev = await usuario.get(`/api/ocurrencias/${oid}/evidencia`);
    assert.equal(ev.status, 200);
    assert.equal(ev.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.compare(ev.data, PNG) === 0);
    assert.equal((await admin.get(`/api/ocurrencias/${oid}/evidencia`)).status, 200);
    assert.equal((await usuario2.get(`/api/ocurrencias/${oid}/evidencia`)).status, 403);
    assert.equal((await usuario.postForm(`/api/ocurrencias/${oid}/cumplir`, formFoto())).status, 409);
  });
  test('rechaza tipos no imagen; otro usuario no puede cumplir', async () => {
    const c = await usuario.post('/api/actividades', { titulo: 'Tipo', frecuencia: 'unica', fecha_inicio: '2043-02-10T08:00:00-05:00' });
    const oid = (await usuario.get(`/api/actividades/${c.data.actividad.id}`)).data.ocurrencias[0].id;
    const f = new FormData(); f.append('evidencia', new Blob(['hola'], { type: 'text/plain' }), 'a.txt');
    assert.equal((await usuario.postForm(`/api/ocurrencias/${oid}/cumplir`, f)).status, 400);
    assert.equal((await usuario2.postForm(`/api/ocurrencias/${oid}/cumplir`, formFoto())).status, 403);
  });
  test('resumen y listado de ocurrencias', async () => {
    const r = (await admin.get('/api/resumen')).data;
    assert.ok(r.pendientes > 0);
    assert.ok(r.cumplidas_mes >= 2);
    assert.ok(Array.isArray(r.proximas));
    const lista = (await admin.get('/api/ocurrencias?estado=cumplida')).data.ocurrencias;
    assert.ok(lista.length >= 2 && lista.every((o) => o.estado === 'cumplida' && 'titulo' in o && 'responsable_nombre' in o && 'tiene_evidencia' in o));
    assert.equal((await admin.get('/api/ocurrencias?desde=2043-01-01&hasta=2043-01-31')).data.ocurrencias.length >= 1, true);
  });
});

describe('alertas con tick(now) simulado', () => {
  const T = (s) => new Date(s); // ISO con offset -05:00
  let oid, actId;
  const logs = async (tipo) => (await db.query(`SELECT canal, ok, detalle, enviado_en FROM alertas_log WHERE ocurrencia_id=$1 ${tipo ? 'AND tipo=$2' : ''} ORDER BY id`, tipo ? [oid, tipo] : [oid])).rows;
  const conteo = async (tipo) => (await logs(tipo)).length;

  before(async () => {
    // aislar: solo esta actividad pendiente
    await db.query('DELETE FROM actividades');
    const c = await admin.post('/api/actividades', { titulo: 'Control de temperatura', frecuencia: 'unica', fecha_inicio: '2031-03-10T09:00:00-05:00', responsable_id: usuarioId });
    actId = c.data.actividad.id;
    oid = (await admin.get(`/api/actividades/${actId}`)).data.ocurrencias[0].id;
  });

  test('antes de las 07:00 de vence-3 no hay alertas', async () => {
    await alerts.tick(T('2031-03-07T06:59:00-05:00'));
    assert.equal(await conteo(), 0);
  });
  test('d3: una sola vez (correo + whatsapp)', async () => {
    await alerts.tick(T('2031-03-07T07:00:00-05:00'));
    const l = await logs('d3');
    assert.deepEqual(l.map((x) => x.canal).sort(), ['correo', 'whatsapp']);
    assert.ok(l.every((x) => x.ok && x.detalle === 'dry-run'));
    await alerts.tick(T('2031-03-07T07:01:00-05:00'));
    await alerts.tick(T('2031-03-07T23:00:00-05:00'));
    assert.equal(await conteo('d3'), 2);
  });
  test('d2: una sola vez', async () => {
    await alerts.tick(T('2031-03-08T06:59:00-05:00'));
    assert.equal(await conteo('d2'), 0);
    await alerts.tick(T('2031-03-08T07:00:00-05:00'));
    await alerts.tick(T('2031-03-08T12:00:00-05:00'));
    assert.equal(await conteo('d2'), 2);
    assert.equal(await conteo('d3'), 2);
  });
  test('d1: una sola vez', async () => {
    await alerts.tick(T('2031-03-09T07:00:00-05:00'));
    await alerts.tick(T('2031-03-09T18:00:00-05:00'));
    assert.equal(await conteo('d1'), 2);
    assert.equal(await conteo('dia'), 0);
  });
  test("'dia': envía a t=00:00, no a t+29, sí a t+30, y repite cada 30 min", async () => {
    await alerts.tick(T('2031-03-10T00:00:00-05:00'));
    assert.equal(await conteo('dia'), 2);
    await alerts.tick(T('2031-03-10T00:29:00-05:00'));
    assert.equal(await conteo('dia'), 2);
    await alerts.tick(T('2031-03-10T00:30:00-05:00'));
    assert.equal(await conteo('dia'), 4);
    await alerts.tick(T('2031-03-10T00:59:00-05:00'));
    assert.equal(await conteo('dia'), 4);
    await alerts.tick(T('2031-03-10T01:00:00-05:00'));
    assert.equal(await conteo('dia'), 6);
  });
  test("'dia' continúa indefinidamente aunque ya haya vencido la hora (días después)", async () => {
    await alerts.tick(T('2031-03-12T10:00:00-05:00'));
    assert.equal(await conteo('dia'), 8);
    await alerts.tick(T('2031-03-12T10:29:00-05:00'));
    assert.equal(await conteo('dia'), 8);
    await alerts.tick(T('2031-03-12T10:30:00-05:00'));
    assert.equal(await conteo('dia'), 10);
  });
  test('se detiene tras cumplir', async () => {
    const antes = await conteo();
    const r = await usuario.postForm(`/api/ocurrencias/${oid}/cumplir`, formFoto());
    assert.equal(r.status, 200);
    await alerts.tick(T('2031-03-12T11:00:00-05:00'));
    await alerts.tick(T('2031-03-13T11:00:00-05:00'));
    assert.equal(await conteo(), antes);
  });
  test('actividad creada ya vencida: alerta inmediata en el primer tick, luego cada 30 min', async () => {
    const c = await admin.post('/api/actividades', { titulo: 'Vencida', frecuencia: 'unica', fecha_inicio: '2031-04-01T08:00:00-05:00', responsable_id: usuarioId });
    const id = (await admin.get(`/api/actividades/${c.data.actividad.id}`)).data.ocurrencias[0].id;
    await alerts.tick(T('2031-04-02T15:00:00-05:00'));
    await alerts.tick(T('2031-04-02T15:10:00-05:00'));
    await alerts.tick(T('2031-04-02T15:30:00-05:00'));
    const n = (await db.query(`SELECT count(*)::int n FROM alertas_log WHERE ocurrencia_id=$1 AND tipo='dia' AND canal='correo'`, [id])).rows[0].n;
    assert.equal(n, 2);
  });
  test('si se crea tarde, solo se envía la previa más reciente (no d3+d2+d1 juntas)', async () => {
    const c = await admin.post('/api/actividades', { titulo: 'Tarde', frecuencia: 'unica', fecha_inicio: '2031-05-10T09:00:00-05:00', responsable_id: usuarioId });
    const id = (await admin.get(`/api/actividades/${c.data.actividad.id}`)).data.ocurrencias[0].id;
    await alerts.tick(T('2031-05-09T12:00:00-05:00'));
    const tipos = (await db.query('SELECT DISTINCT tipo FROM alertas_log WHERE ocurrencia_id=$1', [id])).rows.map((x) => x.tipo);
    assert.deepEqual(tipos, ['d1']);
  });
  test('sin credenciales y sin dry-run: degrada sin error y registra ok=false', async () => {
    const prev = [process.env.MAIL_DRY_RUN, process.env.WA_DRY_RUN];
    process.env.MAIL_DRY_RUN = 'false'; process.env.WA_DRY_RUN = 'false';
    delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    try {
      const c = await admin.post('/api/actividades', { titulo: 'SinCred', frecuencia: 'unica', fecha_inicio: '2031-06-10T09:00:00-05:00', responsable_id: usuario2Id });
      const id = (await admin.get(`/api/actividades/${c.data.actividad.id}`)).data.ocurrencias[0].id;
      await alerts.tick(T('2031-06-10T00:00:00-05:00'));
      const l = (await db.query('SELECT canal, ok, detalle FROM alertas_log WHERE ocurrencia_id=$1', [id])).rows;
      assert.equal(l.length >= 1, true);
      assert.ok(l.some((x) => x.canal === 'correo' && x.ok === false && /credenciales/i.test(x.detalle)));
    } finally { [process.env.MAIL_DRY_RUN, process.env.WA_DRY_RUN] = prev; }
  });
  test('GET /api/alertas lista el log; usuario solo ve el suyo', async () => {
    const a = (await admin.get(`/api/alertas?ocurrencia_id=${oid}`)).data.alertas;
    assert.ok(a.length >= 10);
    const u2 = (await usuario2.get(`/api/alertas?ocurrencia_id=${oid}`)).data.alertas;
    assert.equal(u2.length, 0);
  });
  test('GET /api/cron/tick exige x-cron-secret', async () => {
    assert.equal((await fetch(base + '/api/cron/tick')).status, 401);
    assert.equal((await fetch(base + '/api/cron/tick', { headers: { 'x-cron-secret': 'mal' } })).status, 401);
    const r = await fetch(base + '/api/cron/tick', { headers: { 'x-cron-secret': 'cron-test' } });
    assert.equal(r.status, 200);
  });
});

describe('respuesta a alertas: Cumplido / Pendiente / Notas', () => {
  const { enlacesAlerta, crearToken, leerToken } = require('../server/services/enlaces');
  const { plantillaAlerta } = require('../server/services/mailer');
  const { enviarWhatsapp, normalizarTelefono } = require('../server/services/whatsapp');
  let ocId, token;

  async function nuevaOcurrencia(titulo) {
    const c = await usuario.post('/api/actividades', { titulo, frecuencia: 'unica', fecha_inicio: '2031-09-01T08:00:00-05:00' });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    const oc = (await usuario.get(`/api/actividades/${c.data.actividad.id}`)).data.ocurrencias[0];
    return oc.id;
  }
  const postForm = (ruta, campos) => fetch(base + ruta, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos) });

  before(async () => { ocId = await nuevaOcurrencia('Cambio de reactivos'); token = crearToken(ocId, usuarioId); });

  test('token firmado: válido, manipulado e inválido', () => {
    assert.deepEqual(leerToken(token), { ocurrenciaId: ocId, usuarioId });
    assert.equal(leerToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')), null);
    assert.equal(leerToken(`${ocId + 1}.${usuarioId}.${token.split('.')[2]}`), null);
    assert.equal(leerToken('basura'), null);
  });

  test('el correo y el WhatsApp traen los tres enlaces (cumplido, pendiente, notas)', () => {
    const e = enlacesAlerta(ocId, usuarioId);
    const p = plantillaAlerta({ tipo: 'dia', titulo: 'X', venceEn: new Date(), ocurrenciaId: ocId, nombre: 'Laura', usuarioId });
    for (const k of ['cumplido', 'pendiente', 'notas']) { assert.ok(p.html.includes(e[k]), 'html ' + k); assert.ok(p.text.includes(e[k]), 'texto ' + k); }
    assert.match(p.html, /Cumplido/); assert.match(p.html, /Pendiente/); assert.match(p.html, /Notas/);
  });

  test('GET de las páginas no modifica nada y muestra los formularios', async () => {
    for (const [ruta, txt] of [['', 'Cumplido'], ['/cumplido', 'type="file"'], ['/pendiente', 'sigue pendiente'], ['/notas', '<textarea']]) {
      const r = await fetch(`${base}/r/${token}${ruta}`);
      assert.equal(r.status, 200); assert.match(await r.text(), new RegExp(txt.replace(/[<>"=]/g, '.')));
    }
    assert.equal((await db.query('SELECT estado FROM ocurrencias WHERE id=$1', [ocId])).rows[0].estado, 'pendiente');
    assert.equal((await db.query('SELECT count(*)::int n FROM ocurrencia_notas WHERE ocurrencia_id=$1', [ocId])).rows[0].n, 0);
  });

  test('enlace inválido -> 400; de otro responsable -> 403', async () => {
    assert.equal((await fetch(`${base}/r/xyz/cumplido`)).status, 400);
    const ajeno = crearToken(ocId, usuario2Id);
    assert.equal((await fetch(`${base}/r/${ajeno}/notas`)).status, 403);
  });

  test('Notas: escribir una nota; vacía se rechaza; la alerta sigue pendiente', async () => {
    assert.equal((await postForm(`/r/${token}/notas`, { texto: '   ' })).status, 400);
    const r = await postForm(`/r/${token}/notas`, { texto: 'Falta reactivo de tinción' });
    assert.equal(r.status, 200); assert.match(await r.text(), /Nota guardada/);
    const n = (await usuario.get(`/api/ocurrencias/${ocId}/notas`)).data.notas;
    assert.equal(n.length, 1); assert.equal(n[0].texto, 'Falta reactivo de tinción'); assert.equal(n[0].tipo, 'nota');
    assert.equal((await db.query('SELECT estado FROM ocurrencias WHERE id=$1', [ocId])).rows[0].estado, 'pendiente');
  });

  test('Pendiente: registra el motivo y las alertas continúan', async () => {
    const r = await postForm(`/r/${token}/pendiente`, { texto: 'Se hace mañana' });
    assert.equal(r.status, 200); assert.match(await r.text(), /pendiente/i);
    const n = (await usuario.get(`/api/ocurrencias/${ocId}/notas`)).data.notas;
    assert.ok(n.some((x) => x.tipo === 'pendiente' && x.texto === 'Se hace mañana'));
    const antes = (await db.query('SELECT count(*)::int n FROM alertas_log WHERE ocurrencia_id=$1', [ocId])).rows[0].n;
    await alerts.tick(new Date('2031-09-01T09:00:00-05:00'));
    const despues = (await db.query('SELECT count(*)::int n FROM alertas_log WHERE ocurrencia_id=$1', [ocId])).rows[0].n;
    assert.ok(despues > antes, 'tras marcar pendiente siguen saliendo alertas');
  });

  test('API de notas: usuario ajeno -> 403; admin puede agregar', async () => {
    assert.equal((await usuario2.get(`/api/ocurrencias/${ocId}/notas`)).status, 403);
    assert.equal((await admin.post(`/api/ocurrencias/${ocId}/notas`, { texto: 'Revisado por admin' })).status, 201);
    assert.equal((await admin.post(`/api/ocurrencias/${ocId}/notas`, { texto: '' })).status, 400);
  });

  test('Cumplido: sin foto no cumple; con foto cumple y detiene las alertas', async () => {
    const sin = await fetch(`${base}/r/${token}/cumplido`, { method: 'POST', body: new FormData() });
    assert.equal(sin.status, 400);
    assert.equal((await db.query('SELECT estado FROM ocurrencias WHERE id=$1', [ocId])).rows[0].estado, 'pendiente');
    const con = await fetch(`${base}/r/${token}/cumplido`, { method: 'POST', body: formFoto('Hecho') });
    assert.equal(con.status, 200); assert.match(await con.text(), /cumplida/i);
    const o = (await db.query('SELECT estado, evidencia_mime, length(evidencia) AS bytes FROM ocurrencias WHERE id=$1', [ocId])).rows[0];
    assert.equal(o.estado, 'cumplida'); assert.equal(o.evidencia_mime, 'image/png'); assert.ok(o.bytes > 0);
    const antes = (await db.query('SELECT count(*)::int n FROM alertas_log WHERE ocurrencia_id=$1', [ocId])).rows[0].n;
    await alerts.tick(new Date('2031-09-02T09:00:00-05:00'));
    assert.equal((await db.query('SELECT count(*)::int n FROM alertas_log WHERE ocurrencia_id=$1', [ocId])).rows[0].n, antes);
    const otra = await fetch(`${base}/r/${token}/cumplido`, { method: 'POST', body: formFoto() });
    assert.match(await otra.text(), /ya fue marcada/i);
  });

  test('WhatsApp: normaliza el número con + y detecta rechazos de CallMeBot', async () => {
    assert.equal(normalizarTelefono('300 123 4567'), '+573001234567');
    assert.equal(normalizarTelefono('+57 300-123-4567'), '+573001234567');
    assert.equal(normalizarTelefono(''), null);
    const prevWa = process.env.WA_DRY_RUN, prevFetch = global.fetch; let ultima;
    process.env.WA_DRY_RUN = 'false';
    try {
      global.fetch = async (u) => { ultima = String(u); return { ok: true, status: 200, text: async () => '<p>Message queued. You will receive it in a few seconds.</p>' }; };
      let r = await enviarWhatsapp({ phone: '573001234567', apikey: ' 123456 ', text: 'Hola ✓ link' });
      assert.equal(r.ok, true);
      assert.match(ultima, /phone=%2B573001234567/); assert.match(ultima, /apikey=123456&?/);
      global.fetch = async () => ({ ok: true, status: 200, text: async () => 'ERROR: APIKey is invalid or phone is not activated' });
      r = await enviarWhatsapp({ phone: '573001234567', apikey: '000', text: 'x' });
      assert.equal(r.ok, false); assert.match(r.detalle, /invalid/i);
      global.fetch = async () => ({ ok: false, status: 203, text: async () => 'Forbidden' });
      assert.equal((await enviarWhatsapp({ phone: '573001234567', apikey: '1', text: 'x' })).ok, false);
      global.fetch = async () => { throw new Error('timeout'); };
      assert.equal((await enviarWhatsapp({ phone: '573001234567', apikey: '1', text: 'x' })).ok, false);
      assert.equal((await enviarWhatsapp({ phone: '573001234567', apikey: '', text: 'x' })).omitido, true);
    } finally { global.fetch = prevFetch; process.env.WA_DRY_RUN = prevWa; }
  });
});
