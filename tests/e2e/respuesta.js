// E2E del flujo de respuesta a alertas (Cumplido / Pendiente / Notas) desde el enlace, sin iniciar sesión.
// Uso: JWT_SECRET=<el del servidor> BASE_URL=http://127.0.0.1:3100 node tests/e2e/respuesta.js
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
const { crearToken } = require('../../server/services/enlaces');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const t = (id) => `[data-testid="${id}"]`;
const s = Date.now().toString().slice(-6);
const log = (m) => console.log('OK  ', m);

(async () => {
  const api = await request.newContext({ baseURL: BASE });
  assert.equal((await api.post('/api/auth/login', { data: { email: 'admin@avanzar.local', password: 'Admin2026!' } })).status(), 200);
  const email = `resp${s}@lab.test`;
  const u = await (await api.post('/api/usuarios', { data: { nombre: 'Responsable ' + s, email, password: 'Clave2026!', rol: 'usuario', cargo: 'auxiliar', whatsapp: '573001234567', callmebot_apikey: '111111' } })).json();
  const uid = u.usuario.id;
  const api2 = await request.newContext({ baseURL: BASE });
  await api2.post('/api/auth/login', { data: { email, password: 'Clave2026!' } });
  const a = await (await api2.post('/api/actividades', { data: { titulo: 'Prueba de botones ' + s, frecuencia: 'unica', fecha_inicio: new Date(Date.now() - 3600e3).toISOString() } })).json();
  const oc = (await (await api2.get('/api/actividades/' + a.actividad.id)).json()).ocurrencias[0].id;
  const tok = crearToken(oc, uid);
  assert.equal((await api.get('/api/cron/tick', { headers: { 'x-cron-secret': process.env.CRON_SECRET || 'secreto-e2e' } })).status(), 200);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: 'America/Bogota', viewport: { width: 390, height: 800 } }); // móvil, sin sesión
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));

  await p.goto(`${BASE}/r/${tok}`);
  assert.ok(await p.getByText('Prueba de botones ' + s).count());
  for (const txt of ['Cumplido', 'Pendiente', 'Notas']) assert.ok(await p.locator('a.btn', { hasText: txt }).count(), 'botón ' + txt);
  await p.screenshot({ path: '/tmp/resp-resumen.png' }); log('Página de respuesta con tres botones, sin iniciar sesión');

  await p.click('a.btn:has-text("Notas")');
  await p.fill('textarea[name=texto]', 'Falta reactivo de Gram, llega mañana');
  await p.click('button:has-text("Guardar nota")');
  await p.waitForSelector('text=Nota guardada'); log('Notas: escribir y guardar el mensaje');

  await p.goto(`${BASE}/r/${tok}/pendiente`);
  await p.fill('textarea[name=texto]', 'Se realiza mañana a primera hora');
  await p.click('button:has-text("Confirmar")');
  await p.waitForSelector('text=Registrado como pendiente'); log('Pendiente: registrado, las alertas continúan');

  await p.goto(`${BASE}/r/${tok}/cumplido`);
  await p.click('button:has-text("Marcar como cumplido")');
  assert.equal(await p.locator('input[name=evidencia]').evaluate((e) => e.validity.valueMissing), true); log('Cumplido: el navegador exige la foto');
  await p.setInputFiles('input[name=evidencia]', { name: 'ev.png', mimeType: 'image/png', buffer: PNG });
  await p.fill('textarea[name=comentario]', 'Hecho');
  await p.click('button:has-text("Marcar como cumplido")');
  await p.waitForSelector('text=Se detuvieron las alertas'); log('Cumplido con foto: se detienen las alertas');
  await p.screenshot({ path: '/tmp/resp-cumplido.png' });

  // Dentro de la aplicación: las notas y la evidencia quedaron visibles
  const ctx2 = await browser.newContext({ timezoneId: 'America/Bogota', viewport: { width: 1280, height: 900 } });
  const q = await ctx2.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(BASE + '/#/'); await q.fill(t('login-email'), email); await q.fill(t('login-password'), 'Clave2026!'); await q.click(t('login-submit'));
  await q.waitForSelector(t('nav-panel')); await q.goto(`${BASE}/#/ocurrencia/${oc}`);
  await q.waitForSelector(t('ocurrencia-evidencia')); await q.waitForSelector(t('nota-item'));
  const textos = await q.locator(t('nota-item')).allInnerTexts();
  assert.ok(textos.some((x) => x.includes('Falta reactivo de Gram')), 'nota visible');
  assert.ok(textos.some((x) => x.includes('Se realiza mañana') && x.includes('pendiente')), 'pendiente visible');
  await q.fill(t('nota-texto'), 'Nota desde la aplicación'); await q.click(t('nota-guardar'));
  await q.waitForFunction(() => document.body.innerText.includes('Nota desde la aplicación'));
  await q.screenshot({ path: '/tmp/resp-app.png' }); log('La aplicación muestra las notas, la evidencia y permite agregar más');

  await browser.close();
  assert.deepEqual(errs, [], 'errores JS: ' + errs.join(' | '));
  console.log('\nFlujo de respuesta: todos los pasos OK');
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
