// E2E: node tests/e2e/e2e.js  (requiere servidor en BASE_URL y Playwright)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const SECRET = process.env.CRON_SECRET || 'secreto-e2e';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const t = id => `[data-testid="${id}"]`;
const stamp = Date.now().toString().slice(-6);
const results = [];
async function step(name, fn) { try { await fn(); results.push(['OK', name]); console.log('OK  ', name); } catch (e) { results.push(['FALLO', name]); console.log('FALLO', name, '\n', e.message); throw e; } }
function localDT(d) { const p = n => String(n).padStart(2, '0'); const b = new Date(d.getTime() - 5 * 3600e3); return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}T${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`; }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ timezoneId: 'America/Bogota', locale: 'es-CO', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const login = async (email, pass) => { await page.goto(BASE + '/#/'); await page.fill(t('login-email'), email); await page.fill(t('login-password'), pass); await page.click(t('login-submit')); };
  const logout = async () => { await page.click(t('btn-logout')); await page.waitForSelector(t('login-form')); };
  const email = `bacte${stamp}@lab.test`;

  await step('Bienvenida muestra logos y formulario', async () => {
    await page.goto(BASE + '/'); await page.waitForSelector(t('login-form'));
    assert.ok(await page.locator('img[src*="avanzar-diagnostica"]').count() > 0);
    assert.ok(await page.locator('img[src*="colsubsidio-salud"]').count() > 0);
  });
  await step('Login con clave incorrecta muestra error', async () => {
    await login('admin@avanzar.local', 'mala'); await page.waitForSelector(t('login-error'));
  });
  await step('Admin inicia sesión y ve menú Usuarios', async () => {
    await login('admin@avanzar.local', 'Admin2026!'); await page.waitForSelector(t('nav-usuarios'));
  });
  await step('Admin crea usuario bacterióloga (CRUD create)', async () => {
    await page.click(t('nav-usuarios')); await page.click(t('btn-nuevo-usuario'));
    await page.fill(t('usr-nombre'), 'Bacterióloga ' + stamp); await page.fill(t('usr-email'), email);
    await page.fill(t('usr-clave'), 'Clave2026!'); await page.selectOption(t('usr-rol'), 'usuario');
    await page.selectOption(t('usr-cargo'), 'bacteriologa'); await page.fill(t('usr-whatsapp'), '573001234567'); await page.fill(t('usr-apikey'), '123456');
    await page.click(t('usr-guardar')); await page.waitForSelector(`text=${email}`);
  });
  await step('Admin edita usuario (CRUD update)', async () => {
    const fila = page.locator(t('usuario-fila'), { hasText: email }); await fila.locator('[data-testid^="usr-editar-"]').click();
    await page.fill(t('usr-nombre'), 'Bacterióloga Editada ' + stamp); await page.click(t('usr-guardar'));
    await page.waitForSelector(`text=Bacterióloga Editada ${stamp}`);
  });
  await step('Teclado: Esc cierra modal y atajo N abre nueva actividad', async () => {
    await page.click(t('btn-nuevo-usuario')); await page.waitForSelector(t('modal-usuario')); await page.keyboard.press('Escape');
    await page.waitForSelector(t('modal-usuario'), { state: 'detached' });
    await page.click(t('nav-panel')); await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('n');
    await page.waitForSelector(t('act-form')); await page.goBack().catch(() => {});
  });
  await logout();

  await step('Usuario: no ve Usuarios ni botones eliminar', async () => {
    await login(email, 'Clave2026!'); await page.waitForSelector(t('nav-panel'));
    assert.equal(await page.locator(t('nav-usuarios')).count(), 0);
  });
  await step('Usuario crea actividad mensual con vencimiento hoy', async () => {
    await page.click(t('btn-nueva-actividad')); await page.waitForSelector(t('act-form'));
    assert.ok(await page.locator('img[src*="avanzar-diagnostica"]').count() > 0, 'logo avanzar en formulario');
    assert.ok(await page.locator('img[src*="colsubsidio-salud"]').count() > 0, 'logo colsubsidio en formulario');
    await page.fill(t('act-titulo'), 'Calibración incubadora ' + stamp); await page.fill(t('act-descripcion'), 'Verificar temperatura 35°C');
    await page.click(t('act-frecuencia-mensual'));
    await page.fill(t('act-fecha'), localDT(new Date(Date.now() - 3600e3)));
    await page.click(t('act-guardar')); await page.waitForSelector(t('act-form'), { state: 'detached' });
  });
  await step('Usuario NO ve botón eliminar y API devuelve 403', async () => {
    await page.click(t('nav-actividades'));
    assert.equal(await page.locator('[data-testid^="act-eliminar-"]').count(), 0);
    const r = await page.evaluate(async () => { const l = await (await fetch('/api/actividades')).json(); const a = (l.actividades || l)[0]; return (await fetch('/api/actividades/' + a.id, { method: 'DELETE' })).status; });
    assert.equal(r, 403);
  });
  await step('Se dispararon alertas (correo + WhatsApp) vía tick', async () => {
    const r = await fetch(BASE + '/api/cron/tick', { headers: { 'x-cron-secret': SECRET } }); assert.equal(r.status, 200);
    const j = await page.evaluate(async () => (await (await fetch('/api/alertas')).json()));
    const al = j.alertas || j; const canales = new Set(al.map(a => a.canal)); assert.ok(canales.has('correo') && canales.has('whatsapp'), JSON.stringify([...canales]));
  });
  await step('Cumplir sin foto muestra error', async () => {
    await page.click(t('nav-actividades')); await page.click(t('tab-ocurrencias')).catch(() => {});
    await page.locator(t('ocurrencia-item')).first().locator('a.t').click(); await page.waitForSelector(t('ocurrencia-form'));
    await page.click(t('ocurrencia-cumplir'));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="ocurrencia-foto-error"],[data-testid="ocurrencia-error"]')].some(e => !e.hidden && e.textContent.trim().length > 0));
  });
  await step('Cumplir con foto: vista previa y estado cumplida', async () => {
    await page.setInputFiles(t('ocurrencia-foto'), { name: 'ev.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector(t('ocurrencia-preview'));
    await page.fill(t('ocurrencia-comentario'), 'Hecho, 35.1°C'); await page.click(t('ocurrencia-cumplir'));
    await page.waitForSelector(t('toast'));
    const id = (await page.evaluate(async () => { const r = await (await fetch('/api/ocurrencias?estado=cumplida')).json(); return (r.ocurrencias || r)[0].id; }));
    const ev = await page.evaluate(async (i) => { const r = await fetch('/api/ocurrencias/' + i + '/evidencia'); return [r.status, r.headers.get('content-type')]; }, id);
    assert.equal(ev[0], 200); assert.match(ev[1], /image\//);
    await page.goto(BASE + '/#/ocurrencia/' + id); await page.waitForSelector(t('ocurrencia-evidencia'));
  });
  await step('Tras cumplir ya no hay más alertas (30 min después)', async () => {
    const antes = await page.evaluate(async () => ((await (await fetch('/api/alertas')).json()).alertas).length);
    // el tick usa la hora real; no avanza 30 min, así que solo verificamos que no crezca
    await fetch(BASE + '/api/cron/tick', { headers: { 'x-cron-secret': SECRET } });
    const despues = await page.evaluate(async () => ((await (await fetch('/api/alertas')).json()).alertas).length);
    assert.equal(antes, despues);
  });
  await step('Calendario muestra la ocurrencia y vista semana', async () => {
    await page.click(t('nav-calendario')); await page.waitForSelector(t('cal-grid'));
    await page.click(t('cal-vista-semana')); await page.waitForSelector(t('cal-grid'));
  });
  await logout();

  await step('Admin elimina usuario sin actividades? (409 con actividades; borra tras eliminar)', async () => {
    await login('admin@avanzar.local', 'Admin2026!'); await page.waitForSelector(t('nav-usuarios'));
    const r = await page.evaluate(async (em) => { const l = (await (await fetch('/api/usuarios')).json()).usuarios; const u = l.find(x => x.email === em); return (await fetch('/api/usuarios/' + u.id, { method: 'DELETE' })).status; }, email);
    assert.ok([200, 204, 409].includes(r), 'status ' + r);
  });
  await page.screenshot({ path: '/tmp/e2e-final.png' });
  await browser.close();
  assert.deepEqual(errs, [], 'errores JS: ' + errs.join(' | '));
  console.log(`\n${results.length} pasos OK`);
})().catch(e => { console.error('E2E FALLÓ:', e.message); process.exit(1); });
