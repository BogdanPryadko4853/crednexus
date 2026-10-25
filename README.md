# CredNexus

**Цифровой кредитный кабинет малого и микробизнеса.**

CredNexus объединяет предпринимателя и сотрудника банка в одном кредитном процессе: от финансовой анкеты и проверки компании до ML-скоринга, предложения условий и демонстрационной выдачи. Проект разработан для хакатона Альфа-Банка.

[Приложение](https://app.155.212.216.26.sslip.io) · [Развёртывание и эксплуатация](docs/DEPLOYMENT_BEGET.md) · [Архитектурные материалы](docs/)

> Демонстрационный MVP, не банковская информационная система. ФНС и БКИ — локальные mock-интеграции; договор и выдача средств — симуляции. Компании и заявки демонстрационного кабинета вымышлены. ML-сервис выполняет настоящий CPU-инференс моделей проекта, но его оценки не предназначены для реальных кредитных решений.

## Возможности

- **Кабинет предпринимателя:** несколько компаний и представителей, каталог продуктов, черновики, финансовая анкета и месячный профиль для ML.
- **Автоматический конвейер:** проверки ФНС/БКИ → скоринг → решение. После отправки заявки frontend не запускает этапы вручную.
- **Дополнительные сведения:** вопросы и запросы документов, ответы клиента и повторная верификация с сохранением истории.
- **Рабочее место банка:** расширенная карточка, ручное одобрение, отказ и контрпредложение.
- **Офферы:** принятие, отклонение и автоматическое истечение, согласованные статусы и защита от повторных операций.
- **Документы:** MinIO, контроль прав, размера и фактического формата PDF/PNG/JPEG.
- **Восстановление:** история заявки, healthchecks, ограниченные retry, durable-очередь и продолжение после рестарта.

Успешный путь:

```text
DRAFT → SUBMITTED → VERIFYING → SCORING → OFFERED
                                           ↓
                                        ACCEPTED → AGREEMENT_PENDING → DISBURSED
```

Альтернативные ветви: `NEEDS_INFO`, `MANUAL_REVIEW`, `REJECTED`, `DECLINED`, `EXPIRED`. Технический сбой интеграции не считается отрицательным бизнес-решением.

## Технологии

| Область | Стек |
|---|---|
| Backend | Java 25, Spring Boot 4.1.1, Spring Web MVC, Spring Security / OAuth2 Resource Server, Spring Data JPA / Hibernate, Bean Validation |
| Сборка и API | Gradle Kotlin DSL, Flyway, OpenAPI / Swagger UI |
| Frontend | React 19, TypeScript, Vite, React Router, Tailwind CSS, Keycloak JS |
| ML | Python 3.13, FastAPI, ONNX Runtime, CPU inference |
| Данные | PostgreSQL 17, JSONB, MinIO S3-compatible storage |
| Идентификация | Keycloak 26, OpenID Connect Authorization Code + PKCE S256 |
| Инфраструктура | Docker Engine, Docker Compose, Caddy, Ubuntu, Beget VPS |
| Проверки и доставка | JUnit, Testcontainers, Vitest, Python unittest, GitHub Actions, GHCR |

Точные версии закреплены в build-файлах, lock-файлах и Dockerfiles компонентов.

## Архитектура

Backend — **модульный монолит**: компании, заявки, верификация, скоринг, решения, документы, договор и workflow имеют собственные пакеты. Frontend и ML развёртываются отдельными контейнерами.

```text
crednexus/
├── backend/                 # Java backend, Flyway, unit/integration tests
├── frontend/                # React-кабинеты предпринимателя и сотрудника
├── ml-service/              # FastAPI, модели и проверки ML
├── infrastructure/          # Keycloak, PostgreSQL init, MinIO, Caddy, deploy/backup
├── docs/                    # Диаграммы и эксплуатационная документация
├── .github/workflows/       # CI и production deployment
├── compose.yaml             # Локально: весь основной продукт
├── compose.prod.yaml        # Production: готовые образы из GHCR
└── .env.prod.example        # Production-переменные без секретов
```

Браузер обращается к frontend и `/api` одного origin. Nginx передаёт API backend. Keycloak выдаёт JWT; backend проверяет подпись, issuer, роли и принадлежность к компании. Пароли хранит Keycloak, не таблица пользователей приложения.

Workflow использует PostgreSQL-очередь: `FOR UPDATE SKIP LOCKED`, lease, retry и идемпотентные обработчики. Переходы и история сохраняются транзакционно. Kafka, Redis и RabbitMQ для текущего MVP не требуются.

### Диаграммы

Исходники находятся в [`docs/`](docs/) и открываются в [diagrams.net](https://app.diagrams.net/) или редакторе `.drawio`. Рекомендуемый порядок:

1. [Общий кредитный процесс](docs/01-credit-workflow-overview.drawio).
2. [Архитектура системы](docs/02-system-architecture.drawio).
3. [Доменная ER-модель, Чен](docs/03-domain-model-chen-er.drawio).
4. [Схема данных, Crow’s Foot](docs/04-database-schema-crow-foot.drawio).
5. [Подробная sequence-диаграмма](docs/05-credit-workflow-detailed-sequence.drawio).

Диаграммы отражают проектирование; актуальная физическая схема определяется Flyway-миграциями в `backend/src/main/resources/db/migration/`.

## Быстрый локальный запуск

Нужны Git и Docker Engine / Docker Desktop с Docker Compose v2+. Для контейнерного запуска Java, Node.js и Python на хосте не требуются.

```bash
git clone https://github.com/BogdanPryadko4853/crednexus.git
cd crednexus
git switch develop
docker compose up --build -d
docker compose ps
```

Первая сборка скачивает зависимости и собирает MinIO из закреплённых официальных исходников, поэтому занимает больше времени. Backend применяет Flyway при старте; Hibernate проверяет схему через `ddl-auto=validate`.

| Сервис | Локальный адрес |
|---|---|
| Приложение | <http://localhost:5173> |
| Backend | <http://localhost:8080> |
| Swagger UI | <http://localhost:8080/swagger-ui/index.html> |
| Keycloak | <http://localhost:8081> |
| PostgreSQL | `localhost:5432` |
| MinIO Console | <http://localhost:9001> |

ML доступен backend внутри Docker-сети. Основной `compose.yaml` запускает **Java backend**. Дополнительные `compose.ml.yaml` и `compose.python.yaml` предназначены для отдельных сценариев ML-разработки, не для запуска основного продукта.

### Локальные аккаунты

| Назначение | Логин | Пароль по умолчанию |
|---|---|---|
| Администратор приложения, realm `crednexus` | `admin` | `ChangeMe123!` |
| Администратор Keycloak, master realm | `admin` | `admin` |

Значения предназначены **только для localhost**. Пароль приложения переопределяется через `KEYCLOAK_TEST_ADMIN_PASSWORD`, master realm — через `KEYCLOAK_ADMIN_PASSWORD`.

Обычного пользователя локально создайте через Keycloak: realm `crednexus` → Users → пользователь с заполненным email → постоянный пароль → realm-role `CLIENT`. Для сотрудника используется `BANK_EMPLOYEE`, для администратора приложения — `ADMIN`. Регистрация из формы входа выключена. Backend синхронизирует пользователя при первом авторизованном обращении.

Импорт realm выполняется только при первом создании: изменение env или JSON **не меняет пароль существующего аккаунта**. Используйте управление пользователями Keycloak.

### Конфигурация и отдельный запуск

Compose читает необязательный корневой `.env`; локальные defaults находятся в [`compose.yaml`](compose.yaml). Не используйте их в production.

| Переменные | Назначение |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | База приложения |
| `KEYCLOAK_DB_NAME`, `KEYCLOAK_DB_USERNAME`, `KEYCLOAK_DB_PASSWORD` | Отдельная база Keycloak |
| `KEYCLOAK_ISSUER_URI`, `VITE_KEYCLOAK_URL` | Согласованные публичные адреса авторизации |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` | Объектное хранилище |
| `DOCUMENT_MAX_SIZE_BYTES` | Лимит документа; default 10 MiB |
| `SCORING_PROVIDER` | `ml` в Compose; `rule-based` — явно выбираемый режим |
| `CREDNEXUS_ML_BASE_URL` | Внутренний HTTP-адрес ML |
| `CREDNEXUS_DEVICE`, `CREDNEXUS_MODEL_THREADS` | Устройство и потоки inference |

Для backend вне контейнера установите Java 25 и настройте `SPRING_DATASOURCE_*`, Keycloak и S3-переменные из `backend/src/main/resources/application.yml`.

```bash
cd backend
./gradlew bootRun
```

Логи и остановка без удаления данных:

```bash
docker compose logs -f --tail=100 backend ml
docker compose stop
docker compose up -d
```

**Не используйте `docker compose down -v` для обновления:** PostgreSQL и документы находятся в named volumes.

## Production и доступ

Развёртывание: **Beget VPS**, Ubuntu 26.04.1 LTS, amd64, 5 vCPU, 11 GB RAM по тарифу, 30 GB NVMe. Caddy выдаёт и автоматически продлевает HTTPS-сертификаты.

| Назначение | Адрес / аккаунт |
|---|---|
| Приложение | <https://app.155.212.216.26.sslip.io> |
| Авторизация | <https://auth.155.212.216.26.sslip.io> |
| Предприниматель с демонстрационными компаниями | `alexey.volkov`, `CLIENT` |
| Технический smoke-аккаунт клиента | `demo-client`, `CLIENT` |
| Сотрудник банка | `demo-employee`, `BANK_EMPLOYEE` |
| Администратор приложения | `demo-admin`, `ADMIN` |

Откройте приложение, нажмите «Войти» и используйте нужный аккаунт. **Рабочие production-пароли не публикуются в Git:** владелец передаёт их отдельно. Оператор хранит стандартные аккаунты в защищённом `/etc/crednexus/production.env`: `KEYCLOAK_DEMO_CLIENT_PASSWORD`, `KEYCLOAK_DEMO_EMPLOYEE_PASSWORD`, `KEYCLOAK_DEMO_ADMIN_PASSWORD`. Пароль `alexey.volkov` хранится отдельно в `/etc/crednexus/showcase-password`. Администратор приложения не равен администратору master realm.

Публичны только SSH/HTTP/HTTPS. Backend, PostgreSQL, ML и MinIO не публикуют порты наружу; frontend и Keycloak доступны Caddy через loopback. Админка Keycloak публично закрыта. Production использует `SCORING_PROVIDER=ml` с CPU inference, без неявного fallback.

`sslip.io` — бесплатный внешний DNS, не собственный домен. Для долгосрочной эксплуатации рекомендуется собственный домен.

## CI/CD

Production-ветка — **`develop`**. Pipeline: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

```text
push develop
  → Project CI: backend + PostgreSQL/MinIO tests, frontend tests/build
  → Service CI: ML, API/DB tests, модели, зависимости и workflows
  → Docker build → GHCR: backend / frontend / ml / minio
  → SSH deploy → backup → compose up --wait → публичные HTTPS healthchecks
```

- При ошибке обязательных проверок публикация и деплой не выполняются.
- Образы помечаются **полным commit SHA**; production не зависит от плавающего `latest`.
- Environment `production` разрешает только `develop`; отдельный SSH-ключ хранится в GitHub Secrets.
- CI входит как `deploy`, не root. Restricted gateway разрешает только release-wrapper с проверкой SHA и run ID.
- Actions concurrency, серверный `flock` и проверка head защищают от параллельных и устаревших релизов.
- Перед обновлением создаётся backup; `current` меняется после успешных healthchecks.
- Flyway применяет миграции; автоматический downgrade БД при ошибке **не выполняется**.

Environment Secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`. Для GHCR используется краткоживущий `GITHUB_TOKEN`, не постоянный PAT. Настройка, логи и ограничения отката: [руководство эксплуатации](docs/DEPLOYMENT_BEGET.md).

## Тестирование

Backend integration tests используют настоящие PostgreSQL и MinIO через Testcontainers; нужен Docker daemon.

```bash
# Backend: компиляция, тесты, Flyway, JPA validate
cd backend
./gradlew clean build

# Frontend: Node.js 24, npm 11
cd ../frontend
npm ci
npm test
npm run build
```

ML-проверки и закреплённые зависимости: [`ml-service/README.md`](ml-service/README.md) и Service CI. Контракты API и модели проверяются до публикации образов. Отчёты доступны в artifacts Actions.

[`infrastructure/deploy/smoke.mjs`](infrastructure/deploy/smoke.mjs) дополнительно проверяет публичный OIDC/PKCE-вход, роли, API-путь до выдачи, версию ML, ручное решение и MinIO upload/download. Скрипт создаёт отдельные тестовые записи и запускается оператором с защищённым credentials-файлом.

## Демонстрационный сценарий

1. Войти как `alexey.volkov`, выбрать компанию и активный продукт. В кабинете подготовлены две компании и заявки с выданным кредитом, предложением и черновиком.
2. Создать черновик: сумма, срок, цель; заполнить финансовую анкету и месячный ML-профиль.
3. Отправить заявку. Проверки, скоринг и решение автоматические; наблюдать статусы и историю.
4. При `NEEDS_INFO` ответить на вопрос или приложить требуемый документ. Рассмотрение продолжится после необходимых уточнений.
5. При `OFFERED` принять либо отклонить условия. После принятия дождаться симуляции договора и выдачи.
6. Для ручного сценария войти как `demo-employee`, открыть карточку и принять решение либо сформировать контрпредложение.

Повторяемая подготовка пользовательского кабинета: [`seed-showcase.mjs`](infrastructure/deploy/seed-showcase.mjs). Компании и заявки создаются через API, не прямой записью статусов в PostgreSQL. Существующие данные не удаляются.

### Скоринг и mock-интеграции

В ML-режиме backend передаёт профиль и условия в `/v1/score`, сохраняет версию модели и факторы. Балл: `round((1 - default_next12m) * 100)`. Решение дополнительно учитывает обязательные проверки и лимиты продукта, не только категорию риска.

`RuleBasedScoringProvider` остаётся рабочим явно выбираемым режимом: выручка, расходы, прибыльность, долг, платежи, условия кредита и БКИ. При сбое ML он **не подставляется автоматически**: применяются ограниченные retry и ручное рассмотрение.

Mock ФНС и БКИ независимы: последняя и предпоследняя цифры ИНН соответственно задают сценарий. `6` — отрицательный бизнес-результат, `7` — недостаточно сведений, `8–9` — техническая ошибка. Это тестовое правило, не обращение к реальным реестрам.

## Эксплуатация и границы MVP

- **Данные:** постоянные PostgreSQL/MinIO volumes не удаляются при обновлении.
- **Backup:** ежедневный зашифрованный restic backup БД, документов и конфигурации с согласованной паузой записи. Проверка восстановления — в отдельной PostgreSQL.
- **Offsite:** первоначальная копия вынесена с VPS; автоматическое внешнее хранилище ещё требует настройки. Локальный backup не защищает от потери VPS.
- **Диск:** ротация логов, ограниченная очистка cache и старых образов проекта; deploy запрещён при менее 4 GiB свободного места.
- **Доступность:** один VPS без HA; backup и обновления могут кратковременно прерывать обслуживание.
- **Документы:** контроль формата/размера/прав; антивирус и OCR не реализованы.
- **Сбои:** технические ошибки отделены от отказов; retry ограничены. Для договора/выдачи есть безопасный ручной перезапуск фонового этапа.

Команды логов, обновления, отката, backup и устранения ошибок: **[`docs/DEPLOYMENT_BEGET.md`](docs/DEPLOYMENT_BEGET.md)**.

При `TLS handshake timeout` к Docker Hub проверьте сеть/VPN/proxy Docker Desktop. Отключать TLS или удалять volumes не нужно. При необходимости повторите сборку с `COMPOSE_PARALLEL_LIMIT=1`.
