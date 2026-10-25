# CredNexus: Beget VPS и GitHub Actions

## Окружение и границы

- Ubuntu 26.04.1 LTS, amd64, IP `155.212.216.26`.
- Сайт: <https://app.155.212.216.26.sslip.io>.
- Keycloak: <https://auth.155.212.216.26.sslip.io>.
- Ветка выпуска: `develop`. Backend — Java/Spring Boot, не альтернативный Python backend из `compose.python.yaml`.
- Инференс выполняет настоящий ML FastAPI проекта на CPU. `SCORING_PROVIDER=ml`; fallback на rule-based не включён. Модели и исходники ML не изменяются.
- ФНС, БКИ, договор и выдача остаются демонстрационными симуляциями. Только синтетические данные.
- Это один VPS, не HA-кластер; обновление и согласованный backup могут ненадолго прерывать обслуживание.

## Установка и первый запуск

Docker Engine и Compose устанавливаются из официального apt-репозитория для **resolute**,
а не от другой версии Ubuntu. Caddy — из официального stable-репозитория.
См. [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/) и
[Caddy](https://caddyserver.com/docs/install).

Процедура первоначальной настройки, уже выполненная при развёртывании, хранится в
`infrastructure/deploy/provision.sh`. Она принимает два **публичных** ключа: оператора
и отдельный ключ GitHub Actions. Приватный CI-ключ на VPS не копируется.
После проверки отдельного входа как `deploy` применяется `harden.sh`:
SSH только по ключам, root-вход по существующему ключу сохранён, UFW разрешает TCP 22/80/443.
Не применяйте hardening до проверки новой SSH-сессии и доступности консоли Beget.

Первый запуск может использовать `bootstrap.sh <snapshot.tar.gz>` от root.
Снимок помечается `bootstrap-…`, образы — `snapshot-…`; это **не** успешно прошедший
GitHub Actions релиз. После первого согласованного push production переходит на образы GHCR с полным SHA.
Образы на VPS далее не собираются.

Для переноса снимка с macOS не включайте AppleDouble/xattr-файлы (`._*`): используйте
`COPYFILE_DISABLE=1` и `tar --no-xattrs`. `bootstrap.sh` также отфильтровывает их и
нормализует права каталогов публичного build context. Архив списка файлов без записей
каталогов при umask 077 иначе создаёт родителей 0700, недоступных non-root контейнерам.
Не запускайте ML от root для обхода этой ошибки: модели должны оставаться читаемыми
пользователем образа, а их байты и checksums — неизменными.

## Файлы и секреты на VPS

| Путь | Назначение |
|---|---|
| `/etc/crednexus/production.env` | Случайные production-пароли, права 0600/root |
| `/etc/crednexus/backup.env` | Назначение restic backup |
| `/etc/crednexus/restic-password` | Ключ шифрования backup; хранить копию отдельно от VPS |
| `/opt/crednexus/releases/<SHA>/` | Конфигурация конкретного релиза и `images.env` |
| `/opt/crednexus/current` | Последний успешно проверенный релиз |
| `/opt/crednexus/previous` | Предыдущий успешный релиз |
| `/var/lib/crednexus/last-run` | Защита от устаревшего CI-запуска |
| `/var/backups/crednexus/restic` | Локальный зашифрованный backup; не offsite-защита |

`.env.prod.example` — только перечень переменных, не рабочие секреты.
Production Compose намеренно не содержит небезопасных паролей по умолчанию.
Пароли генерируются один раз, повторный bootstrap их не заменяет.

Тестовые аккаунты realm `crednexus`:

- `demo-client` — `CLIENT`.
- `demo-employee` — `BANK_EMPLOYEE`.
- `demo-admin` — `ADMIN` приложения, не администратор Keycloak master.
- `alexey.volkov` — отдельный `CLIENT` с демонстрационными компаниями и заявками.
- `platform-admin` — отдельный bootstrap-администратор Keycloak master.

С разрешения владельца пароли четырёх аккаунтов приложения опубликованы в
разделе «Публичные демонстрационные аккаунты» корневого README. Поэтому стенд
не предназначен для реальных или конфиденциальных данных. Пароли инфраструктуры,
Keycloak master, SSH-ключи и токены остаются закрытыми.
Операторские значения находятся в соответствующих `KEYCLOAK_DEMO_*_PASSWORD` и
`KEYCLOAK_ADMIN_PASSWORD` переменных защищённого файла. Не публикуйте файл целиком,
не включайте `set -x` и не выводите инфраструктурные секреты в логи Actions.
Регистрация выключена. Realm импортируется **только при его отсутствии**:
изменение JSON не перезаписывает существующие аккаунты, пароли и настройки.
После изменения пароля в Keycloak обновите защищённую документацию/секреты;
изменение env само по себе пароль существующего пользователя не меняет.

Админка Keycloak публично закрыта Caddy. Для управления используйте SSH-туннель
на локальный порт `18081` (с исходным root-ключом оператора) и корректный Host/HTTPS
через локальный прокси либо `kcadm.sh` внутри контейнера. Не открывайте порт 18081 наружу.

## Сеть, HTTPS и авторизация

На хосте Caddy слушает HTTP/HTTPS; сертификаты выпускаются и продлеваются автоматически.
Frontend опубликован только на `127.0.0.1:18080`, Keycloak — на `127.0.0.1:18081`.
PostgreSQL, ML, backend, MinIO и MinIO Console не имеют опубликованных портов.
Не рассчитывайте только на UFW: опубликованные Docker-порты могут обходить его правила.

Frontend использует `/api` того же origin: nginx передаёт запросы внутреннему backend.
Публичный JWT issuer фиксирован:
`https://auth.155.212.216.26.sslip.io/realms/crednexus`;
JWK загружается backend по внутреннему адресу Keycloak. Public client использует OIDC
Authorization Code + PKCE S256; password grant выключен. Redirect, logout redirect
и web origin ограничены адресом приложения. Caddy задаёт заголовки прокси,
Keycloak запускается в production-режиме с `KC_PROXY_HEADERS=xforwarded`.

`sslip.io` — сторонний бесплатный DNS: домены не принадлежат проекту.
Его доступность, DNS-фильтры и лимиты CA — внешние зависимости. Для постоянного
production рекомендуется собственный домен с заменой адресов Caddy/Keycloak/frontend/issuer.

## Автоматический CI/CD

`.github/workflows/deploy.yml`:

1. Push в `develop` запускает существующие Project CI и Service CI как reusable workflows.
2. Выполняются backend unit/integration tests на PostgreSQL/MinIO, frontend tests/build,
   ML unit/API/PostgreSQL tests, CPU ONNX verification и существующие проверки ML.
3. Только после успеха обоих workflows собираются четыре amd64-образа: backend, frontend, ml, minio.
4. Образы публикуются как `ghcr.io/bogdanpryadko4853/crednexus-<service>:<FULL_SHA>`.
5. Job с Environment `production` подключается по отдельному ключу как `deploy`.
6. Restricted SSH gateway допускает только `deploy <SHA> <run ID>`.
   У `deploy` нет группы Docker и общего sudo; root-owned wrapper имеет строго ограниченный интерфейс.
7. VPS проверяет head `develop`, номер запуска и свободное место, скачивает образы,
   ещё раз проверяет head, делает backup перед обновлением и выполняет `up --wait`.
8. После внутренних healthchecks проверяются публичные HTTPS endpoints, и только затем
   меняется указатель `current`. Миграции Flyway применяет backend автоматически.

`concurrency` не отменяет выполняющийся деплой. Серверный `flock` сериализует деплой,
backup и обслуживание; проверка head и high-water run ID не позволяет старому workflow
перезаписать новый релиз. Push во время уже начавшегося обновления будет обработан
следующим запуском; атомарности с самим событием GitHub push один VPS не обеспечивает.

Для pull приватных GHCR-образов используется временный `GITHUB_TOKEN` job с `packages:read`.
Он передаётся SSH по stdin, используется во временном Docker config в `/run`, после
завершения файл удаляется. Постоянный PAT не нужен. Репозиторий исходников сейчас
читается по HTTPS без учётных данных; для приватного репозитория понадобится отдельный read-only доступ.

### GitHub Environment и Secrets

В GitHub создайте **Settings → Environments → production**. Разрешите deployments
только из ветки `develop`. Не назначайте обязательное ручное approval, если нужен
полностью автоматический деплой. Добавьте environment secrets:

| Secret | Значение |
|---|---|
| `DEPLOY_HOST` | `155.212.216.26` |
| `DEPLOY_SSH_KEY` | Содержимое отдельного приватного CI-ключа |
| `DEPLOY_KNOWN_HOSTS` | Закреплённый SSH host key VPS, полученный по доверенному SSH-соединению |

На Mac подготовлены отдельные файлы `~/.ssh/crednexus_actions_ed25519` и
`~/.ssh/crednexus_actions_known_hosts`. Не вставляйте их в Git.
Если установлен и авторизован GitHub CLI с правами администратора репозитория:

```bash
gh auth login
bash infrastructure/deploy/setup-github.sh
```

Скрипт не печатает приватный ключ и не делает push. Для ручной вставки ключа в GitHub
можно использовать `pbcopy < ~/.ssh/crednexus_actions_ed25519` на Mac.
Права Actions должны разрешать `packages:write`; при уже существующем GHCR package
проверьте его привязку к репозиторию и **Manage Actions access**.
Можно указать отдельно расположенный CLI: `CREDNEXUS_GH_CLI=/absolute/path/to/gh bash infrastructure/deploy/setup-github.sh`.

После настройки Environment выполните согласованный commit и push в `develop`.
Результат доставки проверяйте по конкретному run в GitHub Actions и SHA в
`/var/lib/crednexus/last-sha`. Успех локальных тестов и bootstrap не заменяет
успешный удалённый CI/CD run.

Compose, realm-файл и тема берутся из конкретного SHA автоматически. Root-owned
SSH gateway, release/backup wrappers и `/etc/caddy/Caddyfile` устанавливаются при
provisioning; изменения этих административных файлов применяются оператором отдельно
после проверки, не произвольной командой из SSH Actions. Существующий realm при обычном
обновлении не перезаписывается.

## Проверки и демонстрация

Локальные проверки:

```bash
cd backend && ./gradlew clean build
cd ../frontend && npm ci && npm test && npm run build
```

`infrastructure/deploy/smoke.mjs` проверяет браузерный вход через публичный Keycloak,
синхронизацию пользователя, права CLIENT/BANK_EMPLOYEE, создание компании/продукта/заявки,
финансовый снимок и ML-профиль, настоящий ML, оффер и принятие до `DISBURSED`.
Отдельная заявка с детерминированной ошибкой ФНС проходит retry и ручной отказ сотрудника.
Запросы бизнес-операций идут через публичный `/api` после реального OIDC login.
Скрипт создаёт **новые синтетические данные** при каждом запуске; не запускайте его бесконтрольно.
Для запуска требуется Playwright с Chromium и защищённый локальный файл учётных данных:

```bash
CREDNEXUS_CREDENTIALS="$HOME/.ssh/crednexus-production.env" \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node infrastructure/deploy/smoke.mjs
```

Не записывайте HAR/видео/trace с паролями и JWT в публичные артефакты.
Для пользовательской демонстрации подготовлен `alexey.volkov` (Алексей Волков),
компании «Северная обжарка» и «Городская пекарня». Их реквизиты и финансовые
показатели вымышлены; внешний вид кабинета не содержит технических smoke-названий.
Пароль находится в `/etc/crednexus/showcase-password` (0600), не в Git.
Операторская копия — `~/.ssh/crednexus-showcase-password` на Mac.

Повторяемое наполнение через API (не изменяет существующие статусы напрямую):

```bash
CREDNEXUS_CREDENTIALS="$HOME/.ssh/crednexus-production.env" \
  CREDNEXUS_SHOWCASE_PASSWORD_FILE="$HOME/.ssh/crednexus-showcase-password" \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node infrastructure/deploy/seed-showcase.mjs
```

Скрипт переиспользует компании по ИНН и заявки по компании/продукту/сумме/сроку/цели;
не запускайте его одновременно в нескольких процессах. Если ранее оставленный
оффер уже истёк либо пользователь изменил сценарий, скрипт сообщает ошибку, а не
переписывает завершённую историю. Аккаунт создаётся отдельно в Keycloak с ролью
`CLIENT`; повторный import production realm его не создаёт.

Для демонстрации вручную используйте `demo-client` и `demo-employee` в разных браузерных
профилях. Для автоматического пути последние две цифры синтетического ИНН — `00`;
для ручного рассмотрения из-за ошибок ФНС — `08` (после ограниченных retry).
Денежные, месячные и финансовые поля ML-профиля нужно заполнить: silent fallback отсутствует.

## Команды оператора: состояние, логи, перезапуск

Следующие команды исполняются через существующий root SSH оператора,
**не** через ограниченный CI-ключ:

```bash
ssh crednexus-vps
release=$(readlink -f /opt/crednexus/current)
dc() { docker compose --env-file /etc/crednexus/production.env \
  --env-file "$release/images.env" -f "$release/compose.prod.yaml" "$@"; }
dc ps --all
dc logs --tail 100 backend ml
journalctl -u caddy --since '15 minutes ago'
dc restart backend ml
dc up -d --no-build --wait --wait-timeout 300
df -h /
systemctl list-timers 'crednexus-*'
```

Логи Docker ограничены `local`, 3 × 10 MiB на контейнер; Caddy — 3 × 10 MiB на сайт,
journald — 200 MiB. Не выводите `docker compose config` или `docker inspect` без фильтра:
они могут раскрыть environment. `config --quiet` безопаснее.

## Backup и восстановление

```bash
sudo /usr/local/sbin/crednexus-backup
systemctl status crednexus-backup.timer
journalctl -u crednexus-backup.service --since today
set -a; source /etc/crednexus/backup.env; set +a
restic snapshots
restic check
```

Backup ежедневно в 03:15 UTC (+ до 10 минут случайной задержки), хранение — 7 daily +
4 weekly. Перед сохранением backend и MinIO останавливаются, чтобы заморозить записи;
после backup запускаются **те же контейнеры**, а не произвольно выбранные старые образы.
Сохраняются `pg_dumpall` (приложение, Keycloak, роли), файлы MinIO, production-секреты и конфигурация.
Backup зашифрован restic. Пока он лежит только на VPS, потеря VPS означает потерю backup.

Для offsite назначьте отдельное S3/SFTP/restic-хранилище в `/etc/crednexus/backup.env`
и сохраните соответствующие credentials только на сервере. Restic поддерживает
`RESTIC_REPOSITORY=s3:https://…/bucket/path`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
Сначала выполните ручной backup/check; лишь затем полагайтесь на timer.
Не используйте тот же MinIO на этом VPS как «внешний backup».
Возможно копирование зашифрованного локального restic repository на Mac при отсутствии
идущего backup/prune, плюс отдельная защищённая копия restic-password.

Порядок восстановления (только с отдельным подтверждением оператора):

1. Остановить записи приложения. Выбрать snapshot `restic snapshots`.
2. Выполнить `restic restore <ID> --target /secure/restore-directory`; не восстанавливать поверх активных volumes.
3. Поднять отдельные пустые PostgreSQL/MinIO volumes. Восстановить SQL через `psql`
   и документы в MinIO data directory с исходными правами.
4. Восстановить согласованную конфигурацию и секреты. Запустить образы нужного SHA.
5. Проверить Flyway/Hibernate validate, аккаунты, количество записей, загрузку/скачивание документов
   и бизнес-процесс; только затем переключить production на восстановленные volumes.

Для отдельной проверки SQL без изменения production можно выполнить от root
`bash infrastructure/deploy/verify-backup.sh` (на сервере используйте путь к файлу
в текущем release). Скрипт восстанавливает dump в сетево-изолированную PostgreSQL
с данными в tmpfs, проверяет приложение и Keycloak, затем удаляет только свой тестовый контейнер.

Не удаляйте исходные volumes. SQL содержит чувствительные данные: не печатайте его в терминал.

## Откат

Посмотреть текущий/предыдущий релиз: `readlink -f /opt/crednexus/{current,previous}`.
Откат выполняется оператором, а не подделкой старого номера CI run.

После backup и проверки **совместимости схемы** запустите Compose предыдущего релиза
с его `images.env`, дождитесь healthchecks и публичных проверок; только после этого
переключите `current`. `previous` и его образы удерживаются обслуживанием диска.
Автоматический downgrade SQL не выполняется. Если новая миграция несовместима со старым
кодом, нужен forward-fix либо восстановление согласованного backup в отдельные volumes.
Не пытайтесь автоматически вернуть БД назад после неудачного обновления.

## Диск и ошибки

- Новый deploy блокируется при остатке менее 4 GiB. Timer каждый час проверяет место,
  чистит только недельный build cache и неиспользуемые GHCR-теги **этого проекта**, кроме
  текущего и предыдущего. Рабочие volumes и чужие образы не удаляются.
- Bootstrap-образы сохраняются; после нескольких успешных CI-релизов оператор может
  отдельно удалить их, убедившись, что они не нужны для отката.
- `TLS handshake timeout` при pull — сеть/registry; повторить после проверки доступности,
  не отключать TLS и не менять теги произвольно.
- `permission denied` GHCR — проверить связь package с репозиторием и permissions token.
- SSH CI `Only deploy…` — ключ преднамеренно не разрешает shell/SFTP/port forwarding.
- `Requested SHA is no longer the head` — безопасно пропущен устаревший запуск.
- 502 Caddy — проверить `dc ps`, backend/Keycloak health и журнал Caddy.
- Ошибки issuer/redirect — должны совпадать публичные HTTPS адреса, не localhost.
- Изменённый realm JSON не меняет существующий realm: использовать админский интерфейс/API.
- Ошибка ML не заменяется случайным баллом; retry и ручное рассмотрение сохраняются workflow.
- Backup/maintenance failure виден в `systemctl --failed` и journald. Внешние уведомления
  требуют отдельного канала мониторинга; один timer сам по себе не является мониторингом доступности.

**Никогда не выполняйте `docker compose down -v`, `docker volume prune` или удаление
production volumes ради обновления.** Для обычного обновления достаточно pull/up через pipeline.

## Фактически проверено 25 октября 2026

- Публичные HTTPS, OIDC Authorization Code + PKCE и JWT issuer.
- Браузерные входы `demo-client` / `demo-employee`, ограничения CLIENT на банковские API и logout.
- Автоматическая заявка до `DISBURSED`, включая историю `AGREEMENT_PENDING`, реальный
  ML (`onnx-sha256:1a60078ed44de07594dd6bb264a6dab15f87852c00a075f6c155b75dbdcaa9f7`), документы MinIO.
- Техническая ошибка ФНС, ограниченные retry, `MANUAL_REVIEW`, карточка сотрудника и ручной отказ.
- Перезапуск всех контейнеров, сохранность первой заявки и документа, повторный полный сценарий.
- 59 backend-тестов, 130 frontend-тестов, 50 ML unit/API-тестов — успешно.
- Restic backup/check и восстановление SQL приложения и Keycloak в отдельную PostgreSQL — успешно.
- Первичная зашифрованная копия backup вынесена на Mac в `~/crednexus-backups/beget/`;
  ключ restic — отдельно в `~/.ssh/crednexus-restic-password`. Автоматический offsite
  backup требует назначения постоянно доступного внешнего хранилища.

### Проверка автоматической доставки

Environment `production` и три deployment secrets настроены. Первый полный
[production run 40200085996](https://github.com/BogdanPryadko4853/crednexus/actions/runs/40200085996)
успешно доставил commit `2d3b7c35c67736bf9065fbecfedb04693b12bfa9` через
CI → GHCR → restricted SSH → backup → Compose healthchecks → публичный HTTPS.
Production перешёл с bootstrap на образы с полным Git SHA.

Первый attempt остановился на существующем Python-тесте
`test_inference_does_not_block_event_loop`: ожидание старта потока ограничено
100 мс. Повтор failed jobs прошёл без изменения ML-кода и тестов. Это известный
источник нестабильности теста на shared runner, а не повод отключать gate:
при падении доставка не выполняется. Окончательное исправление синхронизации
этого теста потребует отдельного изменения ML-service, который в этой задаче не менялся.

MinIO build cache общий для backend integration tests и публикации образа:
`type=gha,scope=production-minio`. Это сохраняет сборку из закреплённых исходников,
но не требует повторять компиляцию Go при каждом обновлении документации.
