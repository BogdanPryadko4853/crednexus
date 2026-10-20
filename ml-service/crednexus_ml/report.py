"""Generate a reviewable model report from actual saved results."""
import argparse,json,re
from pathlib import Path
import numpy as np
import pandas as pd
from .common import json_dump


def read(path):return json.loads(Path(path).read_text())
def table(headers,rows):return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(map(str,r))+' |' for r in rows])


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--artifacts',type=Path,default=Path('artifacts/benchmark_v1'))
    p.add_argument('--foundation',type=Path,default=Path('artifacts/foundation'));p.add_argument('--output',type=Path,default=Path('docs/TRAINING_REPORT.md'));a=p.parse_args()
    root=a.artifacts;run=read(root/'run.json');registry=read(root/'registry.json')
    lines=['# Обучение и сравнение моделей CredNexus','',
    'Это исторический benchmark всех семейств и ансамблей. Текущий комплект MVP использует одиночные модели; '
    'его состав и компромиссы описаны в [DEPLOYMENT.md](DEPLOYMENT.md). Указанный ниже выбор по validation относится к benchmark.','',
    'Обучены CatBoost, LightGBM и XGBoost для двух кредитных таргетов и двух денежных потоков. '
    'Выбор параметров и весов ансамбля сделан по validation; отложенные test и stress_test используются для итогового измерения качества.', '',
    '**Данные полностью синтетические. Эти метрики подтверждают работу прототипа на симуляторе, '
    'но не качество банковского скоринга на реальных клиентах. Название SOTA не гарантирует победу на конкретном датасете.**','',
    '## Эксперимент','',f"Генератор {run['dataset_generator_version']}, manifest SHA256 `{run['dataset_manifest_sha256']}`. "
    f"Seed {run['seed']}. Только CPU, {run['threads']} потока на процесс. Гиперпараметры: Optuna TPE, "
    f"{run['score_trials_per_family']} попыток на семейство/кредитный таргет и {run['forecast_trials_per_family']} на семейство/прогнозный таргет. "
    'Early stopping по validation. Train, validation и test разделены по компаниям и времени; labels дозрели до следующей когорты.','',
    'CRC32(company_id)%10 < 7 определяет часть validation для подбора моделей/ансамбля; остальные компании validation используются '
    'для Platt-калибровки скоринга и эмпирических интервалов прогноза. '
    'В прогнозных таблицах есть повторные origins одной компании: строки не являются независимыми наблюдениями.','',
    'Параметры, все trial scores, native weights, schemas, registries и построчные predictions сохранены в `artifacts/benchmark_v1`. '
    'Модель может использовать только признаки на дату origin. Скрытые параметры симулятора, будущие состояния и будущий макропуть исключены. '
    'Добавлены финансовые отношения и значение потока в прошлом году для прогнозируемого месяца.','']
    panel=read(root/'panel/panel.json');lines+=['Обучающая панель рядов: '+', '.join(f'{k}: {v:,}' for k,v in panel['rows'].items())+'. '
        'HPO обучается на фиксированных 120 000 train-строках; затем проверяется refit на 480 000. '
        'Сохраняется вариант с меньшим validation WAPE. Test и stress_test взяты полностью из соответствующих forecast cohorts.','']
    summary={};score_plot=[];forecast_plot=[]
    for target in registry:
        reg=read(root/target/'registry.json');metrics=read(root/target/'metrics.json');classification=target.startswith('default')
        lines += ['## '+target,'']
        if classification:
            lines += ['Основной составной таргет включает 90+DPD, вынужденную реструктуризацию или закрытие с долгом; '
                'отдельный 90DPD-таргет не следует смешивать с ним.' if target=='default_next12m' else 'Цель: просрочка 90+ дней в следующие 12 месяцев.','']
            rows=[]
            for name,v in metrics.items():
                te=v['test']['calibrated'];ood=v['stress_test']['calibrated']
                rows.append([name,f"{v['validation_selection']['average_precision']:.4f}",f"{te['average_precision']:.4f}",f"{te['roc_auc']:.4f}",f"{te['brier']:.4f}",f"{ood['average_precision']:.4f}"])
                if target=='default_next12m':score_plot.append((name,te['average_precision'],ood['average_precision']))
            lines += [table(['Модель','Val tune AP ↑','Test AP ↑','Test ROC-AUC ↑','Test Brier ↓','Stress AP ↑'],rows),'']
            te=metrics[reg['selected_candidate']]['test']['calibrated'];summary[target]=te
            lines += [f"На test доля событий {te['observed_rate']:.2%}, средняя оценка после калибровки {te['mean_probability']:.2%}. "
                'AP зависит от частоты класса; маленькие различия между семействами не доказывают их устойчивое превосходство.','']
        else:
            base=read(root/target/'baselines.json');rows=[]
            for name,v in metrics.items():
                te=v['test'];ood=v['stress_test'];rows.append([name,f"{v['validation_selection']['wape']:.2%}",f"{te['wape']:.2%}",f"{te['mae']:,.0f}",f"{ood['wape']:.2%}"])
                forecast_plot.append((target,name,te['wape']))
            for name in ['seasonal_naive','recent_mean']:
                te=base['test'][name];rows.append([name,'—',f"{te['wape']:.2%}",f"{te['mae']:,.0f}",f"{base['stress_test'][name]['wape']:.2%}"])
                forecast_plot.append((target,name,te['wape']))
            lines += [table(['Модель','Val tune WAPE ↓','Test WAPE ↓','Test MAE, ₽ ↓','Stress WAPE ↓'],rows),'']
            te=metrics[reg['selected_candidate']]['test'];summary[target]=te
            lines += ['WAPE = сумма абсолютных ошибок / сумма фактических сумм. Это агрегированная ошибка денежных объёмов, '
                'а не средняя процентная ошибка компании; крупные потоки имеют больший вес.','',
                table(['Горизонт','Test WAPE','Test MAE, ₽'],[[h,f"{v['wape']:.2%}",f"{v['mae']:,.0f}"] for h,v in te['by_horizon'].items()]),'']
        lines += [f"**Выбран по validation:** `{reg['selected_candidate']}`; веса CatBoost / LightGBM / XGBoost: "
                  + ' / '.join(f'{w:.0%}' for w in reg['weights'])+'.','']
    if (a.foundation/'metrics.json').exists():
        fm=read(a.foundation/'metrics.json');fp=read(a.foundation/'panel.json');selection=read(a.foundation/'selection.json')
        lines+=['## Chronos-2: отдельное сравнение на общей панели','',
        '[Chronos-2](https://huggingface.co/amazon/chronos-2) — современная открытая модель временных рядов с Apache-2.0; '
        '[small](https://huggingface.co/autogluon/chronos-2-small) имеет 28M параметров, base — 120M. '
        'Проверены zero-shot small/base и полное дообучение small на CPU (200 и 1000 шагов, batch size 32, LR 1e-5). '
        'Обновления весов используют только train-компании, месяцы не позже 47; 4000 многомерных историй. '
        'Вход: поступления, выплаты, продажи, расходы и остаток; контекст до 48 месяцев, прогноз 3 месяца.','',
        'Панель выбрана по feature-таблицам до чтения labels: максимум две точки прогноза на компанию. '
        f"Число контекстов {fp['contexts']}; строки по split: {fp['rows']}. "
        'Те же строки предсказаны сохранёнными boosting-моделями и baseline. '
        '**Эти числа сопоставимы внутри этой панели; их нельзя напрямую ранжировать по результатам полного test выше.**','']
        runtime_rows=[]
        for name in ['chronos2_small_zero','chronos2_small_finetuned','chronos2_small_finetuned1000','chronos2_base_zero']:
            path=a.foundation/(name+'_runtime.json')
            if path.exists():
                rt=read(path);runtime_rows.append([name,f"{rt['parameters']/1e6:.1f}",f"{1000*rt['one_company_median_seconds']:.1f}",f"{rt['panel_seconds']:.1f}"])
        lines += [table(['Модель','Параметров, M','Одна компания, 3 месяца, мс','Вся панель, с'],runtime_rows),'']
        for target,mm in fm.items():
            decision=selection[target]
            lines += ['### '+target,'',table(['Модель','Validation WAPE','Test WAPE','Stress WAPE'],[
                [name,*[f"{v[s]['wape']:.2%}" for s in ['validation','test','stress_test']]] for name,v in mm.items()]),'',
                f"Лучший отдельный кандидат по validation: `{decision['best_single']}`. "
                f"Отдельный поиск смеси выбрал {decision['foundation_weight']:.0%} `{decision['blend_foundation']}` "
                f"и {1-decision['foundation_weight']:.0%} boosting; validation WAPE {decision['validation_wape']:.2%}.",'']
        lines+=['P10–P90 Chronos сохранены вместе с фактическим покрытием в `artifacts/foundation/metrics.json`; '
            'это интервалы модели, без гарантии покрытия на наших компаниях. '
            'Победитель общей панели не заменяет автоматически модель, отобранную на гораздо большей validation-выборке.','']
    if (root/'inference_verification.json').exists():
        runtime=read(root/'inference_verification.json');rows=[]
        for target in registry:
            t=runtime[target];rows.append([target,f"{t['single_row_median_ms']:.1f}",f"{t['batch_seconds']:.3f}",f"{t['selected_weights_megabytes']:.2f}"])
        lines += ['## CPU и воспроизводимость','',table(['Задача','Один запрос, мс','Пакет 1024, с','Выбранные веса, MB'],rows),'',
            f"Пиковый RSS проверочного процесса: {runtime['process_max_rss_megabytes']:.0f} MiB. "
            'Измерение включает загрузку данных для проверки; inference в приложении не требует всего датасета. '
            'Время зависит от процессора и нагрузки. '
            'Для всех трёх семейств и четырёх таргетов predictions после загрузки native weights проверены '
            'против сохранённых тестовых predictions на 1024 строках; допустимая относительная ошибка 1e-6.','']
    for phase in ['scoring','forecast']:
        path=root/(phase+'_resources.txt')
        if path.exists():
            content=path.read_text();rss=re.search(r'Maximum resident set size \(kbytes\): (\d+)',content);elapsed=re.search(r'Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): (.+)',content)
            if rss:lines += [f"Обучение {phase}: пик RSS {int(rss[1])/1024:.0f} MiB; wall time {elapsed[1] if elapsed else '—'}. "
                'Это ресурсы отдельного процесса; параллельные эксперименты суммируют память.','']
    lines += ['Скоринг продолжался из сохранённых завершённых поисков параметров. Его wall time относится '
              'к заключительному процессу и не включает предыдущие поиски. Замеры выполнены на AMD Ryzen 5 7500F '
              'с лимитом 4 потока на ML-процесс; на другом офисном CPU время будет отличаться.','']
    if (root/'interval_metrics.json').exists():
        iv=read(root/'interval_metrics.json');lines+=['## Интервалы денежных потоков','',
            '90%-интервалы построены по нормированным абсолютным остаткам отдельных validation-компаний, по горизонту. '
            'Проверяется эмпирическое покрытие; временной дрейф и зависимость origins исключают обещание гарантированного покрытия.','',
            table(['Цель','Calibration coverage','Test coverage','Stress coverage'],[[t,*[f"{v[s]['coverage']:.2%}" for s in ['validation','test','stress_test']]] for t,v in iv.items()]),'']
    lines += ['График основных моделей: [model_comparison.png](model_comparison.png).','',
    'Готовый архив для приложения: `artifacts/deployment_cpu.tar.gz`, около 23 MB. '
    'В него входят выбранные native weights, schemas, registries и checksums; код загрузки находится в `crednexus_ml`.','',
    '## Ограничения и использование','',
    'Окончательный выбор сравнивает только реально обученные конфигурации при ограниченном CPU-бюджете. '
    'Это не исчерпывающий поиск и не доказательство глобального SOTA. '
    'Для демо используйте `crednexus_ml.inference.Predictor`: модель хранится в памяти между запросами, API и GPU не нужны. '
    'Локальные файлы весов, schema и registry обязательны; ключи внешних LLM для этого ML-кода не используются.','',
    'На реальных данных потребуются переобучение, отдельный out-of-time тест и повторная калибровка. '
    'Не принимайте кредитные решения по этим синтетическим вероятностям. Ошибки распознавания документов здесь не моделируются '
    'как качество OCR; в обучении используется основное observed-представление, не таблицы с грубыми искусственными повреждениями.','',
    'Версии библиотек и dataset fingerprint: `artifacts/benchmark_v1/run.json`; '
    'команды повторного запуска и контракт входов: `docs/MODELS.md`.','']
    a.output.parent.mkdir(exist_ok=True,parents=True);a.output.write_text('\n'.join(lines))
    json_dump(root/'summary.json',summary)
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,3,figsize=(15,4),layout='constrained')
    names=[p[0] for p in score_plot];pos=np.arange(len(names))
    axes[0].bar(pos-.18,[v[1] for v in score_plot],.36,label='Test');axes[0].bar(pos+.18,[v[2] for v in score_plot],.36,label='Stress')
    axes[0].set_xticks(pos,names,rotation=25);axes[0].set_title('Composite credit risk: AP (higher better)');axes[0].legend()
    for ax,target in zip(axes[1:],['cash_inflow_target','operating_cash_outflow_target']):
        rows=[v for v in forecast_plot if v[0]==target];ax.barh([v[1] for v in rows],[100*v[2] for v in rows]);ax.set_xlabel('Test WAPE, % (lower better)');ax.set_title(target.removesuffix('_target'))
    fig.savefig(a.output.parent/'model_comparison.png',dpi=160);plt.close(fig)
    print(a.output)


if __name__=='__main__':main()
