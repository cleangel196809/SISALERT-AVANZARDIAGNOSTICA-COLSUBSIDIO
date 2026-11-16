# SISALERT – Contrato técnico (Avanzar Diagnóstica / Colsubsidio Salud)
Sistema para que bacteriólogas y auxiliares programen actividades de laboratorio y reciban alertas por correo (Gmail SMTP) y WhatsApp (CallMeBot) hasta subir evidencia fotográfica.

## Stack
Node 22, Express 4, pg, bcryptjs, jsonwebtoken (cookie httpOnly `sisalert_token`), multer (memoria, máx 6 MB, jpg/png/webp/heic), nodemailer, googleapis (cuenta de servicio), node-cron. Frontend SPA vanilla (HTML/CSS/JS ES modules) en `public/`, sin build. Evidencia guardada como BYTEA en Postgres (Render free no tiene disco). Zona horaria fija America/Bogota. Todo en español.

## Estructura
```
server/  index.js app.js db.js migrate.js seed.js auth.js routes/*.js services/{mailer,whatsapp,gcal,alerts,recurrence}.js
public/  index.html css/app.css js/*.js img/logos/*.svg img/forms/*.svg
tests/   api.test.js (node:test) e2e/*.spec.js (Playwright)
Dockerfile render.yaml .env.example package.json
```
Env: DATABASE_URL, JWT_SECRET, PORT, TZ=America/Bogota, SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER, SMTP_PASS, MAIL_FROM, CALLMEBOT_ENABLED(true/false), GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ID, CRON_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, APP_URL, MAIL_DRY_RUN / WA_DRY_RUN (si "true" no envía, solo registra en alertas_log: para pruebas).

## Base de datos (migrate.js idempotente, CREATE IF NOT EXISTS)
- usuarios(id serial pk, nombre, email unique, password_hash, rol 'admin'|'usuario', cargo 'bacteriologa'|'auxiliar'|'coordinadora'|'otro', whatsapp (solo dígitos con indicativo, ej 573001234567), callmebot_apikey, activo bool default true, creado_en)
- actividades(id, titulo, descripcion, categoria, responsable_id fk, creado_por fk, frecuencia 'unica'|'semanal'|'mensual'|'trimestral'|'semestral'|'anual', fecha_inicio timestamptz, fecha_fin date null, activa bool default true, gcal_event_id null, creado_en, actualizado_en)
- ocurrencias(id, actividad_id fk cascade, vence_en timestamptz, estado 'pendiente'|'cumplida', cumplida_en, cumplida_por fk, comentario, evidencia bytea, evidencia_mime, unique(actividad_id, vence_en))
- alertas_log(id, ocurrencia_id fk cascade, tipo 'd3'|'d2'|'d1'|'dia', canal 'correo'|'whatsapp', destino, enviado_en, ok bool, detalle)
Seed: admin desde ADMIN_EMAIL/ADMIN_PASSWORD (default admin@avanzar.local / Admin2026! y avisar cambiarla).

## Recurrencia
Al crear/editar una actividad se generan ocurrencias por adelantado: únicas 1; semanal 26 semanas; mensual 12; trimestral 8; semestral 4; anual 3 (desde fecha_inicio, hasta fecha_fin si existe). Un job diario extiende el horizonte. Editar fecha/frecuencia regenera ocurrencias pendientes futuras (nunca borra cumplidas).

## Alertas (services/alerts.js, función tick(now) exportada, node-cron cada minuto + GET /api/cron/tick con header x-cron-secret)
Para cada ocurrencia pendiente de actividad activa y responsable activo, hora local Bogotá:
- d3: una vez, a partir de las 07:00 del día vence-3 días; d2: vence-2; d1: vence-1 (si ya pasó la hora y no se envió, se envía en el primer tick).
- dia: desde las 00:00 del día de vencimiento (o inmediatamente si se crea ya vencida) y luego cada 30 min (según último envío en alertas_log tipo 'dia') INDEFINIDAMENTE hasta que la ocurrencia pase a 'cumplida'.
Cada alerta va por correo (HTML con logos Avanzar y Colsubsidio Salud, título, fecha/hora, botón "Marcar como realizada" → `${APP_URL}/#/ocurrencia/:id`) y por WhatsApp (CallMeBot: GET https://api.callmebot.com/whatsapp.php?phone=&text=&apikey=) si el usuario tiene whatsapp+apikey. Se copia a todos los usuarios admin con `notificar_admin` no existe: solo al responsable. Cada intento se registra en alertas_log. Un fallo de canal no bloquea el otro.
Cumplir una ocurrencia REQUIERE foto (multipart campo `evidencia`); sin foto → 400.

## API (JSON, prefijo /api, errores {error:"mensaje"})
Auth: POST /auth/login {email,password} → {usuario}; POST /auth/logout; GET /auth/me → {usuario}; POST /auth/cambiar-clave {actual,nueva}.
Usuarios (admin CRUD completo): GET /usuarios (admin: todos; usuario: lista corta id,nombre,cargo), GET /usuarios/:id, POST /usuarios, PUT /usuarios/:id, DELETE /usuarios/:id (solo admin; 403 a otros), PUT /usuarios/yo (cualquiera edita su nombre, whatsapp, callmebot_apikey). POST /usuarios/:id/probar-alerta (admin) envía correo+WA de prueba.
Actividades: GET /actividades?desde&hasta&responsable&estado, GET /actividades/:id, POST /actividades, PUT /actividades/:id, DELETE /actividades/:id (SOLO admin). Rol 'usuario': solo ve/crea/edita sus propias actividades (responsable_id forzado a su id) y NO puede borrar (403). Admin ve y asigna a cualquiera.
Ocurrencias: GET /ocurrencias?desde&hasta&estado&responsable (con titulo, responsable_nombre, tiene_evidencia), GET /ocurrencias/:id, POST /ocurrencias/:id/cumplir (multipart: evidencia + comentario), GET /ocurrencias/:id/evidencia (imagen), PUT /ocurrencias/:id (comentario/reprogramar vence_en; admin o responsable), DELETE /ocurrencias/:id (admin).
Panel: GET /resumen → {pendientes, vencidas, cumplidas_mes, proximas:[...]}.
Alertas: GET /alertas?ocurrencia_id (log; admin ve todo).
Salud: GET /salud → {ok:true}.
Calendario Google: al crear/editar/borrar actividad se crea/actualiza/borra un evento en GOOGLE_CALENDAR_ID (con RRULE según frecuencia); si no hay credenciales se omite sin error.

## Marca
Colores Colsubsidio (variables CSS en :root, fáciles de cambiar): --rojo #E30613, --azul #003B71, --azul-claro #E8F0F8, --gris #F4F5F7, --verde #00A859 (cumplida), --ambar #F5A300 (alerta). Logos como SVG en public/img/logos/: colsubsidio-salud.svg y avanzar-diagnostica.svg son isologos PROPUESTOS (no oficiales) reemplazables por los oficiales con el mismo nombre de archivo. Aparecen en: pantalla de bienvenida/login, cabecera, formulario de creación de actividad y correos de alerta.

## UI (SPA con hash-router)
Bienvenida+login con logos; Panel (tarjetas pendientes/vencidas/cumplidas + próximas); Calendario (mes/semana, clic en día crea actividad); Mis actividades (lista con filtros); Formulario de actividad con ilustraciones (SVG en public/img/forms) por campo/categoría, selector de frecuencia con iconos grandes; Detalle de ocurrencia con subida de foto (cámara móvil `capture`) y vista previa; Admin: usuarios (tabla CRUD con whatsapp y apikey, botón probar alerta), registro de alertas. Accesible con teclado (tab, Enter, Esc, atajos: N nueva actividad, / buscar, g+p panel, g+c calendario) y mouse. Responsive móvil. Foco visible, aria-labels, contraste AA.
