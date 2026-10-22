# CI, Docker и проверки готовности

## GitHub Actions

Workflow `.github/workflows/ci.yml` запускается при push, pull request, вручную
и по понедельникам. Секреты для CI не нужны: тестовые пароли используются только
во временной PostgreSQL на runner. Публикации образов и развёртывания нет.

Проверки:

1. Ruff проверяет синтаксис, неопределённые имена и критические ошибки Python.
   `compileall`, `git diff --check`, Actionlint и `docker compose -f compose.python.yaml config`
   проверяют код, workflow и обе Compose-конфигурации.
2. На Python 3.13.11 с PostgreSQL 16 выполняются все тесты для режимов `auto`,
   `cpu` и `cuda`. GPU на runner не требуется: последний режим проверяет CPU fallback.
3. Проверяются SHA256 комплекта, эталонные прогнозы всех четырёх моделей
   и отсутствие импортов native-бустингов/PyTorch.
4. Alembic применяет миграции, проверяет schema drift, rollback до пустой схемы
   и повторное применение. Это выполняется только в тестовой БД.
5. Branch coverage runtime-кода должен быть не ниже 80%. Обучение, экспорт и
   сравнительные исследования не входят в этот показатель. HTML/XML coverage,
   инвентаризация зависимостей и ONNX-отчёт сохраняются в artifacts.
6. `pip-audit` проверяет точные runtime-версии. Известная уязвимость завершает
   job ошибкой: исключений и `continue-on-error` нет. Это аудит Python-пакетов,
   не системных пакетов контейнера.
7. Buildx собирает цели `ml` и `backend`; ML-образ проверяется без GPU, с read-only
   filesystem и сброшенными capabilities.
8. Поднимаются PostgreSQL, миграция, backend, worker и ML API. Сквозной сценарий
   проверяет решение, прогноз и кассовый разрыв. Worker останавливается, в БД
   создаётся задание, затем проверяется его выполнение после запуска worker.

У job есть таймауты; устаревшие запуски одной ветки отменяются. Actions закреплены
полными SHA, токен имеет `contents: read`, checkout не сохраняет credentials.
Используется `pull_request`, без привилегированного `pull_request_target`.
Dependabot проверяет Actions, Docker и Python-зависимости раз в неделю.
В branch protection можно сделать итоговую проверку **CI** обязательной:
она успешна только при успехе всех групп.

## Runtime locks

`requirements-ml.lock` и `requirements-backend.lock` фиксируют полный состав
runtime для Linux / Python 3.13. Docker устанавливает их; тесты используют
те же constraints. CI проверяет соответствие исходным `requirements-*.txt`.
После изменения прямых зависимостей, включая PR Dependabot, обновите locks:

```bash
cd ml-service
python scripts/lock_runtime.py
python scripts/lock_runtime.py --check
```

Версии закреплены полностью; wheel-хеши не фиксируются. Обновление locks требует
индекса пакетов, inference не требует сети.

## Docker

Dockerfile имеет две конечные цели. Обе используют пользователя UID 10001,
CPU-версию ONNX Runtime и встроенные веса с проверкой при сборке. Данные обучения,
эксперименты, окружения, тесты и `.env` в образ не копируются.

Для команд `--wait` используйте Docker Compose v2.20 или новее.

Только ML, без PostgreSQL и ключей, из корня:

```bash
docker compose -f compose.ml.yaml up --build -d --wait
curl --fail http://127.0.0.1:8001/health/ready
```

Backend, worker и PostgreSQL:

```bash
cp .env.example .env
docker compose -f compose.python.yaml up --build -d --wait
docker compose -f compose.python.yaml ps
```

Значения `.env.example` предназначены для локальной синтетической демонстрации.
Для иных окружений задайте свои пароль БД и служебный ключ.

Compose включает `init`, read-only root filesystem, временный `/tmp`,
`cap_drop: ALL`, `no-new-privileges`, завершение по SIGTERM, ожидание PostgreSQL
и миграции. Порты опубликованы на loopback. База хранится в named volume.
ML Compose имеет отдельное имя проекта и может работать одновременно с backend.

## CPU и отсутствие GPU

Текущий проверенный ONNX-комплект TreeEnsemble исполняется через
**CPUExecutionProvider**. GPU-ускорение в него не включено. CUDA, PyTorch,
NVIDIA Container Toolkit и Docker `--gpus` не нужны.

| `CREDNEXUS_DEVICE` | Поведение |
|---|---|
| `auto`, по умолчанию | Проверяет провайдеры ORT, выбирает CPU |
| `cpu` | Явный CPU |
| `cuda` | Предпочтение CUDA принимается; текущий комплект использует CPU с причиной fallback |

В ML `/health/ready` поле `runtime` содержит запрошенное устройство, выбранные
устройство/провайдер, доступные провайдеры и причину fallback. Наличие CUDA-провайдера
отражает сборку ORT, не подтверждает физическую видеокарту.
При отсутствии CPU-провайдера или ошибочной настройке запуск завершается ошибкой.

Причины fallback: `cuda_provider_unavailable` либо `tree_ensemble_cpu_policy`.
При явном `cpu` причина равна `null`. `CREDNEXUS_MODEL_THREADS` задаёт 1–64 CPU-потока
на модель, по умолчанию 4.

## Healthcheck

| Компонент | Условия |
|---|---|
| ML `/health/live` | Процесс отвечает |
| ML `/health/ready` | Четыре модели загружены, SHA256 проверены, эталонные прогнозы и интервалы прогреты |
| Backend `/health/live` | Процесс отвечает независимо от БД |
| Backend `/health/ready` | БД доступна, Alembic revision актуальна; ожидание ограничено 3 секундами |
| Worker | Свежий heartbeat, живой PID, модели загружены, БД/схема доступны, основной цикл без технической ошибки |

Backend readiness не подтверждает наличие worker: его probe отдельный.
Worker обновляет файл атомарно каждые 5 секунд и удаляет его при штатном завершении.
Probe отклоняет файл старше 30 секунд, `ready=false`, отсутствующий PID,
некорректное содержимое и timestamp из будущего.

```bash
docker compose -f compose.python.yaml exec -T backend python -m crednexus_ml.healthcheck http
docker compose -f compose.python.yaml exec -T worker python -m crednexus_ml.healthcheck worker
docker compose -f compose.ml.yaml exec -T ml python -m crednexus_ml.healthcheck http
```

Переменные: `CREDNEXUS_HEALTHCHECK_MODE=http|worker`,
`CREDNEXUS_HEALTHCHECK_URL=http://127.0.0.1:8000/health/ready`,
`CREDNEXUS_WORKER_HEALTH_FILE=/tmp/crednexus-worker-health.json`.
Для нескольких worker на одном хосте задавайте разные файлы; в Compose файловые
системы контейнеров отдельные. `unhealthy` сам по себе не перезапускает контейнер:
`restart: unless-stopped` применяется при завершении процесса.

Используются [провайдеры ONNX Runtime](https://onnxruntime.ai/docs/execution-providers/)
и [порядок запуска Compose](https://docs.docker.com/compose/how-tos/startup-order/).

## Локальные проверки

```bash
cd ml-service
python -m pip install -c requirements-backend.lock -r requirements-ci.txt
python -m ruff check .
python -m crednexus_ml.onnx_demo
python scripts/lock_runtime.py --check
python -m coverage run -m unittest discover -s tests -v
```

Для полного покрытия нужна отдельная PostgreSQL-база с именем, заканчивающимся
на `_test`: тесты очищают её бизнес-таблицы.

```bash
export DATABASE_URL='postgresql+asyncpg://user:password@127.0.0.1:5432/crednexus_test'
export CREDNEXUS_TEST_DATABASE_URL="$DATABASE_URL"
python -m alembic upgrade head
python -m alembic check
python -m coverage run --append -m unittest discover -s backend_tests -v
python -m coverage report
```

Без тестовой БД интеграционные тесты пропускаются. Порог CI проверяется на полном
наборе с PostgreSQL. Сборка Docker и статус контейнеров требуют доступного daemon.
