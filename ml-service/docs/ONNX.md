# ONNX-модели для CPU

В репозитории находятся четыре готовых ансамбля: `ml-service/models/onnx`. Их можно запускать сразу после clone, без датасета, обучения, native-бустингов, PyTorch, GPU и внешних API. Общий размер ONNX-файлов — около 28 MB. Это модели прототипа, обученные на сценарной синтетике, не проверенный банковский PD.

Из `ml-service`:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-onnx.txt
python -m crednexus_ml.onnx_demo
```

```python
from crednexus_ml.onnx_inference import OnnxPredictor

risk = OnnxPredictor('models/onnx', 'default_next12m', threads=4)
pd12m = risk.predict(application_features)

inflow = OnnxPredictor('models/onnx', 'cash_inflow_target', threads=4)
predicted_rub = inflow.predict(forecast_features)
lo_point_hi = inflow.predict_interval(forecast_features)
```

Загружайте объекты один раз при запуске сервиса. Доступны также `default_90dpd_next12m` и `operating_cash_outflow_target`. Контракт исходных DataFrame и исторических признаков — в [MODELS.md](MODELS.md). Примеры входов лежат в `models/onnx/examples.json`: только искусственные финансовые признаки, без исходов/будущих данных. При интеграции код вычисления лагов и агрегатов остаётся частью сервиса.

## Контракт ONNX

Каждый `model.onnx` принимает `features: float32[N,F]`, возвращает `prediction: float64[N,1]`. Порядок колонок и словари категорий заданы в соседнем `schema.json`. Категория кодируется индексом в её train-словаре, неизвестная/отсутствующая — `-1`. Числовые пропуски — `NaN`. `OnnxPredictor` рассчитывает производные признаки, выполняет кодирование и проверяет обязательные колонки.

В ONNX включены исходные деревья всех выбранных семейств, CatBoost CTR/one-hot-преобразования, категориальные ветвления LightGBM/XGBoost, веса смеси, обратное масштабирование денежных потоков, отсечение отрицательных потоков и Platt-калибровка вероятностей. Для регрессии эмпирические интервалы рассчитывает Python-загрузчик по данным `registry.json`.

Штатный [экспорт CatBoost](https://catboost.ai/docs/en/concepts/apply-onnx-ml) не поддерживает категориальные признаки. Здесь преобразование построено по frozen CTR-таблицам и категориям собственного Python-export CatBoost. Переобучения, удаления признаков и аппроксимации другой моделью нет. LightGBM/XGBoost представлены оператором [TreeEnsemble v5](https://onnx.ai/onnx/operators/onnx_aionnxml_TreeEnsemble.html), включая membership-условия. Требуется runtime с `ai.onnx.ml` opset 5; проверен ONNX Runtime 1.26.0 CPU.

CatBoost и LightGBM совпадают с native практически до машинной точности. XGBoost native суммирует float32, а ONNX — double; возможны небольшие численные различия. Фактические максимальные/средние ошибки и времена сохранены в `models/onnx/verification.json`. Это не побитное совпадение. Валидировались validation/test/stress, пропуски и неизвестные категории, все 12 исходных моделей и четыре итоговых ансамбля.

## Повторный экспорт

Нужны локальные native-артефакты предыдущего обучения (`artifacts/benchmark_v1`); они не входят в Git. Сначала воспроизведите обучение по [MODELS.md](MODELS.md), затем:

```bash
python -m pip install -r requirements-onnx-export.txt
python -m crednexus_ml.onnx_export
python -m crednexus_ml.onnx_verify data/sme_100k_v2
python -m crednexus_ml.onnx_demo
```

Индивидуальные ONNX всех 12 моделей сохраняются локально в `artifacts/onnx_components`. В Git входят четыре выбранных ансамбля, schemas/registries, provenance, проверки и демопримеры. Chronos-2 остаётся сравнительным экспериментом; его веса/ONNX в комплект приложения не входят, так как выбранные бустинги точнее на нашей общей панели.

`training_run.json` фиксирует датасет/seed/версии обучения; `export_manifest.json` — версии экспортёра, opsets и SHA256 native weights. `checksums.json` содержит контрольные суммы экспортированных файлов. Большие датасеты, кеши, virtualenv и промежуточные эксперименты игнорируются Git.
