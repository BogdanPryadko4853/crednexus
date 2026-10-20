"""Write an up-to-date human-readable dataset audit from measured JSON artifacts."""
import argparse
import json
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dataset',type=Path)
    args=parser.parse_args();root=args.dataset
    docs=Path(__file__).resolve().parents[1]/'docs'
    m=json.loads((root/'manifest.json').read_text());v=json.loads((root/'validation_report.json').read_text())
    a=json.loads((docs/'adequacy_v2_metrics.json').read_text());p=json.loads((root/'cash_plateau_check.json').read_text())
    old=json.loads((docs/'cash_plateau_before_liquidity_fix.json').read_text())
    assert m['source_sha256']==a['source_sha256']==p['source_sha256']
    s=v['summary'];n=m['rows']['companies'];size=sum(f.stat().st_size for f in root.rglob('*') if f.is_file())/1e9
    lines=[f'# Повторный аудит данных: версия {m["generator_version"]}','',
    '**Вердикт: подходит для хакатонного MVP и диагностического обучения.** Качество на реальных российских клиентах остаётся неподтверждённым. Все данные — сценарная синтетика.','',
    '## Что показала проверка прямой зелёной линии','',
    'На предыдущем графике зелёная линия обозначала остаток денег. У SYN2-00000001 он обнулился в месяце 40; фирма закрылась в месяце 56. До закрытия деньги полностью уходили на платежи, после закрытия новые продажи прекратились.','',
    'Первоначальная проверка финансовых равенств не обнаружила экономический артефакт массового расходования всего остатка. Повторный аудит показал длинные нулевые остатки у слишком большой доли работающих компаний. Ранее положительная оценка v2 была слишком оптимистичной в этой части.','',
    'Исправление: компания может сохранять часть реальных денег на ближайшую зарплату и поставки, согласно индивидуальной финансовой дисциплине. Сохранённый буфер уменьшает доступную сумму платежей и остаётся в денежном балансе; долг не прощается. Случайный шум к нулевому остатку не прибавляется. Непрерывный финансовый стресс дольше 24 месяцев приводит к прекращению деятельности (возможна отсрочка на месяц выдачи).','',
    '| Проверка | До исправления | Текущий набор |','|---|---:|---:|',
    f'| Компании с ≥6 рабочими месяцами нулевого остатка подряд | {old["zero_cash_runs_6m_operating_companies"]/old["companies"]*100:.2f}% | {p["zero_cash_runs_6m_operating_companies"]/n*100:.2f}% |',
    f'| Компании с ≥12 такими месяцами | {old["zero_cash_runs_12m_operating_companies"]/old["companies"]*100:.2f}% | {p["zero_cash_runs_12m_operating_companies"]/n*100:.2f}% |',
    f'| Максимальная непрерывная нулевая серия в работе | {old["max_zero_run_operating"]} мес. | {p["max_zero_run_operating"]} мес. |',
    f'| Рабочие месяцы с почти нулевым остатком | {old["operating_zero_cash_months"]/old["operating_months"]*100:.2f}% | {p["operating_zero_cash_months"]/p["operating_months"]*100:.2f}% |',
    f'| Рабочие компании с положительной константой ≥12 месяцев | {old["positive_constant_runs_12m_operating_companies"]} | {p["positive_constant_runs_12m_operating_companies"]} |','',
    'Нулевые или постоянные остатки после закрытия допустимы: заканчиваются поступления и выплаты либо остаётся неподвижный ликвидационный остаток. После закрытия новые origins прогноза не создаются. Будущее закрытие после действительного origin сохраняется в target. Эти хвосты не удаляются для искусственного улучшения метрик.','',
    '## Объём актуального набора','', '| Таблица | Строк |','|---|---:|',
    f'| Компании | {n:,} |',f'| Месячная история (96 месяцев) | {m["rows"]["monthly_observed"]:,} |',
    f'| Допустимые скоринговые заявки | {s["eligible"]:,} |',f'| Примеры прогноза 1/2/3 месяца | {m["rows"]["forecast_features"]:,} |',
    f'| Размер всех представлений | ≈{size:.2f} ГБ |','',
    'Clean/observed/corrupted — представления одних компаний, а не независимые наблюдения. Исторические отчёты старых версий сохранены только как небольшие агрегаты; старые большие Parquet-наборы удалены.','',
    '## Экономические показатели','',
    f'- Медианный годовой объём продаж: {a["annual_sales_quantiles"]["0.5"]/1e6:.2f} млн руб.; p99 {a["annual_sales_quantiles"]["0.99"]/1e6:.2f} млн.',
    f'- Полные годы работающих компаний с отрицательным операционным proxy: {a["annual_negative_operating_margin_share"]*100:.2f}%. Это не бухгалтерская чистая прибыль.',
    f'- Медианный остаток: {a["origin_quantiles"]["cash_months_expense"]["0.5"]:.2f} месяца операционных расходов.',
    f'- Медианный DSO-proxy: {a["origin_quantiles"]["dso_proxy"]["0.5"]:.1f} дня; p99 {a["origin_quantiles"]["dso_proxy"]["0.99"]:.1f} дня.',
    f'- Заявки с ненулевым DPD за последние 12 месяцев: {a["historical_dpd_positive_share"]*100:.2f}%.','',
    'Есть договорная кредиторка, запасы, закупки до продажи, независимые будущие шоки, разные сезонные фазы, переходы режима и закрытия. DPO-proxy может быть экстремальным при почти остановившихся закупках; это эффект малого знаменателя, а не буквальный договорный срок.','',
    '## Кредитные исходы и временная проверка','',
    f'Составной исход — {s["defaults"]:,} случаев ({s["defaults"]/s["eligible"]*100:.2f}%). Отдельный 90+DPD — {s["defaults_90dpd"]:,} ({s["defaults_90dpd"]/s["eligible"]*100:.2f}%). Составной сценарный target включает вынужденную реструктуризацию и закрытие с непокрытым долгом, не является точной регуляторной дефиницией default.','',
    'Train, validation и test разделены по компаниям, времени и macro-world. Кредитные labels дозревают до следующей когорты; пограничные прогнозные окна удалены; каждый горизонт покрывает все 12 месяцев года. Все snapshots построены на origin.','',
    '| Модель | Test ROC-AUC | Test AP |','|---|---:|---:|']
    for target,label in [('default_next12m','Составной исход'),('default_90dpd_next12m','90+DPD')]:
        for model,name in [('coverage_and_dpd','2 признака'),('all_features','все признаки')]:
            q=a['diagnostic_scoring'][target][model]['test'];lines.append(f'| {label}, {name} | {q["roc_auc"]:.3f} | {q["average_precision"]:.3f} |')
    lines+=['',
    'Небольшие диагностические модели имеют фиксированные гиперпараметры; test не используется для настройки. Высокий synthetic AUC не доказывает реальную предсказательную способность. Проверять калибровку и ошибки по сегментам, не объявлять сырые прогнозы реальной PD.','',
    '| Прогноз, sampled test | WAPE CatBoost | WAPE seasonal baseline |','|---|---:|---:|']
    for target,label in [('cash_inflow','Поступления'),('operating_cash_outflow','Операционные выплаты')]:
        q=a['diagnostic_forecast']['results']['test'][target]
        lines.append(f'| {label} | {q["catboost"]["wape"]*100:.1f}% | {q["seasonal_naive"]["wape"]*100:.1f}% |')
    lines+=['',
    'Прогноз обучен на выборке 120 тыс. строк, test содержит выборку 48 тыс. Это диагностическая, не взвешенная оценка всей популяции. Все суммы хранятся в рублях; оптимизация модели масштабирует targets в миллионы для численной устойчивости.','',
    '## Проверки и использование','',
    f'Полный validator: {v["status"]}, {len(v["checks"])} групп проверок; отдельный cash-plateau аудит; 7 unit-тестов, включая регрессию массовых нулевых серий. Проверены деньги, запасы, AR/AP, labels, lifecycle, as-of признаки, календарь и fingerprints.','',
    'Для MVP брать признаки из manifest allowlist, читать большие таблицы частями и начинать обучение прогноза с выборки на CPU. Банковское решение и переходы заявки реализуются отдельным backend rule engine.','',
    'Остаются явно заданные упрощения: месячные DPD, приближённые налоги, отсутствие точной судебной ликвидации/LGD, отсутствие эмпирической калибровки российского портфеля. Нельзя честно выразить сходство с реальным рынком процентом без сопоставимой реальной выборки.','',
    'Артефакты: [графики](../data/sme_100k_v2/dataset_overview.png), [подробный lifecycle](../data/sme_100k_v2/lifecycle_detail.png), [проверка остатков](../data/sme_100k_v2/cash_plateau_check.json), [метрики](adequacy_v2_metrics.json), [data card](DATA_CARD.md).']
    (docs/'ADEQUACY_AUDIT.md').write_text('\n'.join(lines)+'\n')
    (docs/'DATASET_REPORT.md').write_text(f'# Текущий набор: {m["generator_version"]}\n\n{n:,} компаний, {m["rows"]["monthly_observed"]:,} месячных записей, {s["eligible"]:,} заявок, {m["rows"]["forecast_features"]:,} прогнозных примеров.\n\nКаталог: `ml-service/data/sme_100k_v2`. Размер ≈{size:.2f} ГБ.\n\n[Полный повторный аудит](ADEQUACY_AUDIT.md).\n')
    print(docs/'ADEQUACY_AUDIT.md')


if __name__=='__main__':main()
