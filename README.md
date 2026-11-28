# Secret Santa

Приложение для жеребьёвки подарков с персональными поддоменами, анкетами и organizers.

## Локальный запуск

```sh
cp .env.example .env
npm install
npm run env:validate
npm run db:migrate
npm run dev
```

- API: `http://localhost:3000`, фронтенд Vite: `http://localhost:5173` (прокси `/api` → `3000`).
- Тесты: `npm test`; только мониторинг: `node --test tests/monitoring.test.js`.
- Проверки качества (по необходимости): `npm run lint`, `npm run typecheck`, `npm run format`.
- Локальный Caddy — `Caddyfile.internal`, TLS через `tls internal`; браузер покажет предупреждение о самоподписанном сертификате.

`.env.example` содержит только заглушки. Никогда не коммитьте `.env` и реальные токены.

## Production (Docker Compose)

1. Скопируйте `.env.example` в `.env` и замените `APP_URL`, `VITE_APP_URL`, `DOMAIN`, `DOMAIN_NAME` на реальные значения.
2. Для публичного wildcard-домена установите `CADDYFILE=Caddyfile.wildcard` и задайте `CLOUDFLARE_API_TOKEN`; запустите `npm run env:validate`.
3. Запуск:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose logs -f app proxy
docker compose down
```

Сервисы: `app` (Node, порт 3000, healthcheck `/api/health`), `proxy` (Caddy, 80/443, активные проверки upstream), `backup` (циклические копии БД). Тома: `santa-data` (БД), `backups-data` (копии), `caddy-data`, `caddy-config`. Контейнеры запускаются с `init`, `no-new-privileges`, минимальными capabilities и лимитами логов; в финальном образе нет devDependencies.

Production-валидатор запрещает `localhost` в `APP_URL`; для стейджа явно задайте `ALLOW_LOCAL_APP_URL=true`.

## Переменные окружения

| Переменная                                                  | Назначение                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `PORT`                                                      | Порт API, целое 1–65535.                                                          |
| `DB_PATH`                                                   | Путь к SQLite, по умолчанию `./data/secret-santa.sqlite`.                         |
| `DOMAIN`, `DOMAIN_NAME`                                     | Апекс-домен и домен для ссылок/поддоменов.                                        |
| `APP_URL`, `VITE_APP_URL`                                   | Публичный/base URL API и клиента; в production не localhost.                      |
| `VITE_API_BASE_URL`, `VITE_DOMAIN`                          | Базовый путь API и домен клиента.                                                 |
| `TRUST_PROXY`                                               | `true` — доверять одному прокси и `X-Forwarded-*`.                                |
| `CADDYFILE`                                                 | `Caddyfile.internal` или `Caddyfile.wildcard` (файл должен существовать).         |
| `CLOUDFLARE_API_TOKEN`                                      | Обязателен только для `Caddyfile.wildcard`.                                       |
| `TRUSTED_PROXIES`                                           | Необязательный список сетей для блока `servers` Caddy (закомментирован).          |
| `BACKUP_DIR`, `BACKUP_RETENTION`, `BACKUP_INTERVAL_SECONDS` | Каталог копий, число последних копий, интервал цикла в секундах (мин. 60).        |
| `OFFSITE_BACKUP_COMMAND`                                    | Необязательная команда `sh -c`; путь к копии в `BACKUP_FILE`/`BACKUP_PATH`.       |
| `MONITORING_ENABLED`, `MONITORING_INTERVAL_MS`              | Включение фонового мониторинга и период опроса (>=1000 мс).                       |
| `MONITORING_TIMEOUT_MS`, `MONITORING_CONCURRENCY`           | Таймаут проверки (100–60000 мс) и параллелизм (1–32).                             |
| `MONITORING_KEEP_CHECKS`, `MONITORING_KEEP_ERRORS`          | Ротация строк проверок и ошибок в SQLite.                                         |
| `MONITORING_TOKEN`                                          | Токен для `GET /api/monitoring` (сравнение constant-time, в логах не появляется). |
| `MONITORING_WEBHOOK_URL`                                    | Необязательный webhook для алертов о недоступных доменах.                         |
| `ALLOW_LOCAL_APP_URL`                                       | `true` разрешает localhost в `APP_URL` при `NODE_ENV=production`.                 |
| `AUTH_RATE_LIMIT_MAX`                                       | Лимит запросов `/api/auth` в минуту, по умолчанию 20; в browser E2E временно 200. |

Запуск валидации: `npm run env:validate` (по умолчанию читает `.env`, путь можно передать аргументом).

## Внешние шаги (13.23)

Эти шаги зависят от вашей инфраструктуры и не проверяются локально:

1. DNS: A/AAAA на апекс и `*.example.com` на IP сервера или запись через Cloudflare.
2. Cloudflare: выпустить/сохранить `CLOUDFLARE_API_TOKEN` с правами `Zone:DNS:Edit` для нужной зоны, задать `CADDYFILE=Caddyfile.wildcard`.
3. TLS: wildcard-сертификат будет выпущен Caddy через DNS-плагин; для ACME-почты укажите свой адрес вне репозитория (`TLS_EMAIL` приложением не используется).
4. Почта: подключить внешнего провайдера SMTP/API и задать отправителя вне репозитория (`MAIL_FROM` приложением не используется).

## Миграции, бэкапы и восстановление

Миграции версионируются в `server/migrations.js`, таблица `schema_migrations`, начальная схема берётся из `server/schema.sql`, все шаги идут в транзакции с `busy_timeout = 5000`.

```sh
npm run db:migrate
npm run db:backup
npm run db:check-backup
npm run db:restore -- ./data/backups/secret-santa-....sqlite
```

- Перед копией и после неё выполняется `PRAGMA integrity_check`; пустая или отсутствующая копия считается ошибкой.
- Последний успех записывается в `data/backups/last-success.json` и в stdout; ошибки — в stderr с ненулевым кодом. Compose-цикл проверяет код возврата и логирует сбои.
- `OFFSITE_BACKUP_COMMAND` вызывается только после успешной локальной копии; команда не логируется.
- Восстановление проверяет целостность копии **до** замены БД, удаляет `-wal`/`-shm`/`-journal` и повторно проверяет результат. Остановите приложение (`docker compose stop app backup`) перед восстановлением.

## Мониторинг

`MONITORING_ENABLED=true` запускает периодические проверки апекс-домена и поддоменов из таблицы `tenants`. Результаты пишутся в `monitoring_checks`, ошибки — в `monitoring_errors`; старые строки ротируются. Проверки идут параллельно с лимитом, повторный запуск во время проверки пропускается. При failures отправляется webhook (если задан). Токены в логи и алерты не попадают.

```sh
curl -fsS http://localhost:3000/api/health            # SELECT 1 в БД; 503 при ошибке
curl -fsS 'http://localhost:3000/api/health?deep=1'   # статус БД, uptime, время проверки
curl -fsS -H "x-monitoring-token: $MONITORING_TOKEN" http://localhost:3000/api/monitoring
```
