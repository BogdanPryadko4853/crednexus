# FastAPI backend и PostgreSQL

Рабочий backend находится в `crednexus_backend`, рядом с ML-модулями. Старый Java-каркас
в корневом `backend/` не участвует в этом запуске.

Backend сохраняет компании, финансовые профили, заявки, задания, результаты моделей
и решения. SQLAlchemy AsyncSession использует драйвер asyncpg. HTTP API не загружает
модели и не ждёт inference: задания исполняет отдельный worker.

## Запуск Docker Compose

Из корня репозитория:

```bash
cp .env.example .env
docker compose -f compose.python.yaml up --build -d
```

Перед использованием вне локальной демонстрации замените значения в `.env`.
Порты опубликованы на `127.0.0.1`. Compose запускает PostgreSQL, одноразовую миграцию,
FastAPI backend и worker. База сохраняется в named volume `postgres_data`.

- Backend Swagger: http://127.0.0.1:8000/docs
- OpenAPI: http://127.0.0.1:8000/openapi.json
- PostgreSQL: `127.0.0.1:5433`, база и пользователь `crednexus`.
- Состояние: `GET /health/live`, `GET /health/ready`.

Docker-образы, CPU fallback и отдельная проверка готовности worker описаны в [CI.md](CI.md).

Все `/api/v1/*` требуют заголовок `X-API-Key` со значением
`CREDNEXUS_BACKEND_API_KEY`. Health и Swagger доступны без ключа.
Это служебная авторизация: ключ даёт доступ ко всем синтетическим компаниям.
Пользовательские аккаунты, разграничение ролей клиента/сотрудника и tenant isolation
в этой версии не реализованы.

Сквозная HTTP-демонстрация из `ml-service`, с Python 3.13:

```bash
export CREDNEXUS_BACKEND_API_KEY=synthetic-local-demo-api-key
python scripts/backend_demo.py
```

Если заменили ключ в `.env`, используйте своё значение. Скрипт создаёт новую
синтетическую компанию и профиль, отправляет заявку, дожидается решения, запускает
прогноз и расчёт кассового разрыва, затем печатает сохранённые результаты и статусы.
Скрипт использует стандартную библиотеку Python и не требует ML-зависимостей на клиенте.

## Запуск без Docker

Нужна работающая база PostgreSQL 16 и отдельная созданная база приложения.
Из `ml-service`:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-backend.txt
export DATABASE_URL='postgresql+asyncpg://user:password@127.0.0.1:5432/crednexus'
export CREDNEXUS_BACKEND_API_KEY='replace-with-your-internal-api-key'
python -m alembic upgrade head
python -m uvicorn crednexus_backend.api:app --host 127.0.0.1 --port 8000
```

Во втором терминале, с теми же окружением и переменными:

```bash
python -m crednexus_backend.worker
```

Вместо `DATABASE_URL` можно передать `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`: URL будет собран с корректным экранированием пароля. Если переданы оба
варианта, приоритет имеет `DATABASE_URL`.

| Настройка | По умолчанию | Назначение |
|---|---|---|
| `DATABASE_URL` или `PG*` | Нет | Соединение PostgreSQL через asyncpg |
| `CREDNEXUS_BACKEND_API_KEY` | Нет | Ключ минимум 16 символов |
| `CREDNEXUS_MODELS_DIR` | Встроенный `models/onnx` | Каталог моделей worker |
| `CREDNEXUS_MODEL_THREADS` | 4 | Потоки ONNX на модель, 1–64 |
| `CREDNEXUS_JOB_LEASE_SECONDS` | 120 | Срок аренды задания, минимум 10 секунд |
| `CREDNEXUS_POLL_SECONDS` | 1 | Период опроса при пустой очереди |

Readiness проверяет доступность PostgreSQL и актуальную Alembic-ревизию. Он не
подтверждает наличие активного worker; без worker задания остаются в очереди.
При старте worker проверяет SHA256 и эталонные прогнозы всех четырёх моделей.

## Данные и API

| Операция | Метод |
|---|---|
| Создать / получить список компаний | `POST /api/v1/companies`, `GET /api/v1/companies` |
| Получить компанию | `GET /api/v1/companies/{id}` |
| Добавить / получить профили | `POST`, `GET /api/v1/companies/{id}/profiles` |
| Получить профиль | `GET /api/v1/companies/{id}/profiles/{profile_id}` |
| Получить продукты | `GET /api/v1/products` |
| Создать / получить список заявок | `POST`, `GET /api/v1/applications` |
| Получить / заменить черновик | `GET`, `PUT /api/v1/applications/{id}` |
| Отправить заявку | `POST /api/v1/applications/{id}/submit` |
| Принять предложение и запустить новый скоринг | `POST /api/v1/applications/{id}/accept-counter-offer` |
| Получить историю / последнее решение | `GET /api/v1/applications/{id}/events`, `/decision` |
| Поставить прогноз в очередь | `POST /api/v1/companies/{id}/forecasts` |
| Поставить расчёт кассового разрыва | `POST /api/v1/companies/{id}/cash-gaps` |
| Получить задание / задания компании | `GET /api/v1/jobs/{id}`, `/companies/{id}/jobs` |

Списки ограничены `limit` (1–100) и `offset`. Заявки можно фильтровать по `company_id`.
Порядок истории событий задаёт возрастающий `sequence`, включая события одной транзакции.

Финансовый профиль содержит `as_of_month`, `company`, `history`, а также необязательные
`financial_snapshot` и `bureau_history`. Для полного примера возьмите `ScoreRequest`
из `examples/score_request.json` **без `application`**. Истории достаточно для прогноза;
кредитный скоринг требует финансового среза и 12 месяцев БКИ. Если они недоступны,
заявка переходит в `NEEDS_INFO` с перечнем блоков в событии `CREDIT_DATA_REQUIRED`.
Переданные блоки проходят общие ML-валидаторы. Профиль неизменяемый:
исправления сохраняются новой записью. Одинаковое содержимое одной компании, включая
перестановку месячных записей, возвращает существующий профиль. Идентификаторы профилей
проверяются на принадлежность компании.

Для создания заявки:

```json
{
  "company_id": "<uuid компании>",
  "profile_id": "<uuid профиля>",
  "product_code": "working-capital",
  "requested_amount": 1000000,
  "term_months": 12,
  "purpose": "working_capital"
}
```

Ставка и лимит берутся из серверного продукта, клиент их не задаёт. `profile_id`
можно не передавать: при отправке получится `NEEDS_INFO` с событием `PROFILE_REQUIRED`.
Затем `PUT` полностью заменяет параметры и профиль черновика. После отправки редактирование
недоступно. Повторный submit возвращает ту же заявку/задание. После технического
`FAILED` submit создаёт новую попытку обработки отдельным заданием.

При отправке фиксируются входной ScoreRequest, продукт, версия правил, ID и SHA256
профиля. Последующие новые профили не меняют отправленную заявку.

Прогноз: тело `{"profile_id": "<uuid>", "horizons": [1, 2, 3]}`.
Кассовый разрыв: `profile_id`, `months`, `minimum_cash_reserve`, `cash_plan` согласно
[CASH_GAP.md](CASH_GAP.md). История и начальный остаток берутся из профиля.
Оба метода требуют `Idempotency-Key` (1–128 символов). Повторение ключа с тем же
содержимым возвращает то же задание; с другими входами — HTTP 409. Ключи разделены
по компании и виду расчёта.

Постановка возвращает HTTP 202 и JobView. Статус и результат читаются через GET задания:
`QUEUED → RUNNING → SUCCEEDED / FAILED`. Результат содержит прежний контракт ML API:
версии, предупреждения, прогнозы/интервалы или сценарии кассового разрыва.
Для заявки `result` содержит `score` и `decision`. Необработанные входы и stack trace
в ответ задания не включаются.

## Правила решения

Начальный демонстрационный продукт фиксируется миграцией:

- 50 тыс. – 3 млн ₽, 3–36 месяцев, ставка 18%, цель `working_capital`;
- возраст от 12 месяцев, покрытие долга операционным потоком не ниже 1.2;
- риск от 0.10 требует рассмотрения, от 0.20 означает отказ;
- текущие 90+DPD, неподходящий срок/цель/возраст или слишком малая сумма дают отказ;
- меньшая текущая просрочка, стрессовое состояние, неполная история и неизвестные
  категории направляют на `REVIEW_REQUIRED`;
- если запрошенная сумма превышает лимит или платёжную способность, предлагается
  меньшая сумма; если она ниже минимума продукта — отказ.

Платёжная способность: `(средние поступления − средние операционные выплаты) / 1.2`
минус обслуживание существующих долгов. Из доступного платежа рассчитывается сумма
аннуитетного кредита на запрошенный срок. Сумма предложения округляется вниз до копеек.

Это **явные сценарные допущения `demo-credit-v1`**, а не политика банка. Синтетический
риск не подтверждает пригодность реального автоматического кредитного решения.
Решение хранит причины, версию правил, оценённую сумму и предложенные условия.
Новые решения и результаты ML содержат [шаблонные пояснения](EXPLANATIONS.md)
в поле `explanation`, которые сохраняются вместе с результатом без LLM.
Принятие counter-offer запускает новый скоринг именно для принятой суммы.
`REVIEW_REQUIRED` ожидает будущего интерфейса и действий сотрудника; ручное одобрение,
подписание и выдача в этой версии не реализованы.

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> NEEDS_INFO: нет профиля
    NEEDS_INFO --> DRAFT: PUT данных
    DRAFT --> SUBMITTED: submit
    SUBMITTED --> SCORING: worker
    SCORING --> APPROVED
    SCORING --> COUNTER_OFFER
    SCORING --> REJECTED
    SCORING --> REVIEW_REQUIRED
    SCORING --> SUBMITTED: технический повтор
    SCORING --> FAILED: попытки исчерпаны
    FAILED --> SUBMITTED: повторный submit
    COUNTER_OFFER --> DRAFT: принятие условий
```

## Очередь и транзакции

Задание создаётся в той же транзакции, что и отправка заявки. PostgreSQL
`FOR UPDATE SKIP LOCKED` разделяет задания между worker-процессами. Блокировки
удерживаются только при получении/завершении задания. CPU-работа запускается через
`asyncio.to_thread`, вне DB-транзакции и event loop.

Worker обновляет аренду каждые `lease / 3` секунд. После аварийного завершения процесс
может получить истёкшее задание заново. Токен аренды не позволяет старому процессу
перезаписать новый результат. Попыток максимум три, между техническими повторами
есть задержка. Ошибки структуры задания завершаются без повторов.

Исполнение имеет семантику **at least once**: после сбоя модель может выполниться
повторно. Сохранение результата и решения защищено токеном и уникальностью job ID.
Результат, статус заявки, решение и событие записываются одной транзакцией.
CPU-вычисления не производят внешних платежей или других необратимых действий.

Применены [SQLAlchemy AsyncSession](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
и [PostgreSQL SKIP LOCKED](https://www.postgresql.org/docs/16/sql-select.html).

## Миграции и проверки

В схеме семь таблиц: `companies`, `company_profiles`, `credit_products`,
`credit_applications`, `ml_jobs`, `application_events`, `credit_decisions`.
Профили, входы/выходы моделей и правила хранятся в JSONB, связи и состояния —
в отдельных колонках с FK, индексами и ограничениями. `create_all` при старте нет.

```bash
python -m pip install -r requirements-backend-test.txt
python -m unittest discover -s tests -v
```

Для интеграционных тестов создайте **отдельную пустую** базу с именем, заканчивающимся
на `_test`. Тесты очищают бизнес-таблицы в ней. Примените миграцию к этой базе:

```bash
export DATABASE_URL='postgresql+asyncpg://user:password@127.0.0.1:5432/crednexus_test'
python -m alembic upgrade head
python -m alembic check
export CREDNEXUS_TEST_DATABASE_URL="$DATABASE_URL"
python -m unittest discover -s backend_tests -v
```

Без `CREDNEXUS_TEST_DATABASE_URL` интеграционные тесты пропускаются; тесты правил
выполняются всегда. Проверяются реальные PostgreSQL и ONNX, конкурентная отправка,
идемпотентность, потеря аренды, защита от старого worker, технические повторы,
контрпредложение с повторным скорингом, сохранение расчётов и неблокирующий inference.
