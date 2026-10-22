# Модели скоринга и прогноза

Для запуска после clone используйте [ONNX-комплект](ONNX.md): он включён в Git и не требует native-библиотек бустинга. Описанные ниже `artifacts/` относятся к локальному обучению и экспериментам.

Текущий MVP использует одиночные модели: [DEPLOYMENT.md](DEPLOYMENT.md). `artifacts/benchmark_v1` и `artifacts/deployment_cpu.tar.gz` относятся к прежнему эксперименту с ансамблями. Согласованный одиночный native-комплект подготавливается в `artifacts/single_models` и экспортируется в версионируемый `models/onnx`.

Итоговые результаты: [TRAINING_REPORT.md](TRAINING_REPORT.md). Код находится в `crednexus_ml`; сохранённые веса и таблицы экспериментов — в `artifacts/benchmark_v1` и `artifacts/foundation`. Артефакты и данные исключены из Git, но находятся в рабочем каталоге: при переносе приложения их нужно скопировать отдельно.

## Запуск

Из `ml-service`, Python 3.13. Обучение и inference принудительно используют CPU. Основная установка не включает PyTorch и Chronos.

```bash
python -m venv .venv-training
source .venv-training/bin/activate
python -m pip install -r requirements-training.txt -r requirements-plots.txt
OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 MKL_NUM_THREADS=4 python -m crednexus_ml.train data/sme_100k_v2 --output artifacts/benchmark_v1
python -m crednexus_ml.intervals --artifacts artifacts/benchmark_v1
python -m crednexus_ml.verify data/sme_100k_v2 --artifacts artifacts/benchmark_v1
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
python -m crednexus_ml.report
```

Повторный запуск использует завершённые поиски параметров из каталога. Для другого эксперимента задайте новый `--output`; каталог с другим dataset fingerprint не принимается. `--tasks scoring` и `--tasks forecast` позволяют запускать этапы отдельно. Не запускайте два процесса обучения с одним `--output` одновременно: они записывают общий registry. При ограничении памяти запускайте последовательно.

Дополнительный эксперимент с открытыми foundation weights:

```bash
python -m pip install torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements-foundation.txt
HF_HUB_DISABLE_XET=1 OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=4 python -m crednexus_ml.foundation data/sme_100k_v2 --steps 200
python -m crednexus_ml.report
```

CPU-сборка PyTorch позволяет избежать установки CUDA-зависимостей. Основные бустинги PyTorch не используют.

Первичная загрузка Chronos требует сети; потом модель загружается из локального каталога. Веса Apache-2.0. Исходные версии закреплены в коде; repo/revision/SHA256 записаны в `artifacts/foundation/chronos-2-small/source.json` и `chronos-2/source.json`. Small дополнительно дообучается только на train-историях: сравниваются 200 и 1000 шагов, batch size 32, LR 1e-5. Чекпойнты в `artifacts/foundation/finetuning/finetuned-ckpt` и `finetuning1000/finetuned-ckpt`. Ограниченный CPU fine-tuning не является исчерпывающим подбором параметров foundation-модели.

## Inference

Для приложения достаточно `requirements-inference.txt`. Загружайте объекты один раз при старте процесса:

Для native-проверки текущего MVP используйте `artifacts/single_models`, предварительно выполнив подготовку по [ONNX.md](ONNX.md). Старый `artifacts/deployment_cpu.tar.gz` содержит ансамбли benchmark и не является текущим комплектом приложения.

```python
from crednexus_ml.inference import Predictor

credit = Predictor('artifacts/single_models', 'default_next12m', threads=4)
pd12m = credit.predict(application_features)  # numpy vector, calibrated probabilities

dpd90 = Predictor('artifacts/single_models', 'default_90dpd_next12m', threads=4)

inflow = Predictor('artifacts/single_models', 'cash_inflow_target', threads=4)
outflow = Predictor('artifacts/single_models', 'operating_cash_outflow_target', threads=4)
received = inflow.predict(forecast_features)
paid = outflow.predict(forecast_features)
operating_net_cashflow = received - paid
lo_point_hi = inflow.predict_interval(forecast_features)  # [n_rows, 3]
```

`application_features` соответствует исходной строке `score_features` без labels. Финансовые отношения рассчитываются загрузчиком. `schema.json` хранит полный список модельных колонок и train-категории. `company_id`, split и дата не становятся ML-признаками. Передача таблицы с лишними колонками не добавляет их в модель; недостающие обязательные колонки вызывают ошибку. Числовые пропуски допускаются, непредусмотренные типы не исправляются молча.

`forecast_features` — одна строка на origin и горизонт 1, 2 или 3. Помимо исходных признаков из датасета необходимы `cash_inflow_seasonal_target` и `operating_cash_outflow_seasonal_target`: фактически известный поток в месяце **target_month_idx − 12**. Это история, а не label. Например, при прогнозе марта 2027 после января 2027 используйте март 2026. Значение за будущий месяц подставлять запрещено. Если историческое значение отсутствует, передайте NaN; модели обучены с пропусками. Для малого объёма истории качество следует отдельно проверять.

Cashflow-модели предсказывают поступления и операционные выплаты в рублях, с ограничением снизу нулём. Из их разности можно получить операционный net cash flow, но это не остаток на счёте: кредиты, погашения, инвестиции и взносы собственника должны учитываться отдельно. Вероятности дефолта на синтетических данных не пригодны для реального автоматического кредитного решения.

## Содержимое артефактов

- `registry.json`: целевые переменные и пути к локальным registry.
- `<target>/registry.json`: выбранные модели, веса смеси, Platt-калибровка/интервалы.
- `<target>/schema.json`: входные признаки и train-категории.
- `<target>/{catboost,lightgbm,xgboost}/model.{cbm,txt,ubj}`: native weights без pickle.
- `model.json`, `trials.json`: параметры, число деревьев, обучающие строки, validation scores.
- `metrics.json`, `*_predictions.parquet`: метрики и построчные predictions всех кандидатов.
- `run.json`, `panel/panel.json`: версии, seed, датасет, фиксированная выборка.
- `inference_verification.json`: native roundtrip и CPU latency; `*_resources.txt`: peak RSS обучения.
- `training_source`: снимок основных исходников фактического первого обучения; последующие инфраструктурные изменения не меняют сохранённые веса.

Преобразования категорий и порядок колонок фиксированы на train и сохраняются в JSON. Переобучение с теми же seed и версиями воспроизводит эксперимент в пределах особенностей CPU-библиотек; побитное совпадение на любых процессорах не обещается.
