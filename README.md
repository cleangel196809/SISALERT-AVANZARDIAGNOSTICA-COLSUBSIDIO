# SISALERT - Avanzar Diagnóstica / Colsubsidio Salud
Sistema de gestión de alertas para el laboratorio de la clínica infantil. Las bacteriólogas y auxiliares programan actividades y reciben alertas por correo (Gmail SMTP) y WhatsApp (CallMeBot) hasta subir la foto de evidencia. Contrato técnico: `docs/CONTRACT.md`.

## Ejecutar en local
```bash
npm install
cp .env.example .env        # ajustar DATABASE_URL, JWT_SECRET, etc.
npm start                   # migra, crea el admin inicial y arranca en :3000
```
Admin inicial: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (por defecto `admin@avanzar.local` / `Admin2026!`; **cámbiela** tras el primer ingreso).

## Pruebas
Las pruebas (`tests/api.test.js`, `node:test` + `fetch`) usan una base Postgres local y **borran sus tablas**.

```bash
bash tests/start-test-db.sh   # levanta Postgres 16 temporal en :5433 (usuario/db/clave: sisalert); idempotente
npm test                      # 40 pruebas; usa DATABASE_URL o TEST_DATABASE_URL (por defecto el de arriba)
bash tests/start-test-db.sh stop
```
El script usa `/usr/lib/postgresql/16/bin` (variable `PGBIN`) y datos en `/tmp/sisalert-pgdata`; si se ejecuta como root, corre Postgres como el usuario `postgres`. Las pruebas fuerzan `MAIL_DRY_RUN=true` y `WA_DRY_RUN=true`, así que no envían nada. La lógica de alertas se prueba llamando `alerts.tick(now)` con un reloj simulado.

## Despliegue en Render
`render.yaml` define el servicio web (Docker, plan free) y Postgres free. Configure `APP_URL`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `GOOGLE_*`. El plan gratuito duerme el servicio: use un cron externo (p. ej. cron-job.org, cada minuto) que llame `GET /api/cron/tick` con el header `x-cron-secret: <CRON_SECRET>`.
