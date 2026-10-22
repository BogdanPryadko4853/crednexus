"""Deterministic Russian explanations built only from supplied results and plans."""
from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .cash_gap import CashGapCalculation
    from .contracts import PlannedCashMovements
    from .responses import ForecastMonth

TEMPLATE_VERSION = "ru-templates-v1"
MONTHS = ("январь", "февраль", "март", "апрель", "май", "июнь",
          "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь")
MONTHS_GENITIVE = ("января", "февраля", "марта", "апреля", "мая", "июня",
                  "июля", "августа", "сентября", "октября", "ноября", "декабря")
SYNTHETIC_LIMITATION = "Оценки получены на моделях, обученных на сценарных синтетических данных."


class Explanation(BaseModel):
    template_version: str = TEMPLATE_VERSION
    language: Literal["ru"] = "ru"
    title: str
    summary: str
    facts: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


def rubles(value: float) -> str:
    amount = Decimal(str(value))
    rounded = amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    if amount != 0 and rounded == 0:
        return ("минус " if amount < 0 else "") + "менее 0,01 ₽"
    return f"{abs(rounded) if rounded == 0 else rounded:,.2f}".replace(",", " ").replace(".", ",") + " ₽"


def percent(value: float) -> str:
    number = Decimal(str(value)) * 100
    rounded = number.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    if 0 < number < Decimal(".005"):
        return "менее 0,01%"
    return str(rounded).replace(".", ",") + "%"


def month_label(value: date | str, *, genitive: bool = False) -> str:
    month = date.fromisoformat(value) if isinstance(value, str) else value
    names = MONTHS_GENITIVE if genitive else MONTHS
    return f"{names[month.month - 1]} {month.year}"


def warning_explanations(warnings: list[str]) -> list[str]:
    messages = {
        "SYNTHETIC_MODEL": SYNTHETIC_LIMITATION,
        "INCOMPLETE_HISTORY": "Часть финансовой истории отсутствует; точность оценки может снижаться.",
        "SHORT_HISTORY": "Возраст компании составляет менее 12 месяцев.",
        "UNKNOWN_CATEGORY": "Некоторые характеристики компании или заявки не представлены в обучающих данных.",
        "RATE_FLOOR": "Для оценки платежа в расчёте применена минимальная годовая ставка 0,1%.",
    }
    return list(dict.fromkeys(messages[code] for warning in warnings
                              if (code := warning.split(":", 1)[0]) in messages))


def explain_score(default_probability: float, dpd_probability: float, warnings: list[str]) -> Explanation:
    return Explanation(
        title="Оценка кредитного риска",
        summary=f"Оценка вероятности неблагоприятного кредитного события в ближайшие 12 месяцев — {percent(default_probability)}.",
        facts=[
            "Неблагоприятное событие включает просрочку 90 и более дней, вынужденную реструктуризацию или закрытие с непокрытым долгом.",
            f"Отдельная оценка вероятности просрочки 90 и более дней — {percent(dpd_probability)}.",
        ],
        next_steps=["Для кредитного решения учитываются также условия продукта, платёжная нагрузка и результаты проверок."],
        limitations=warning_explanations(warnings) + [
            "Вероятности округлены для отображения; сравнение с порогами выполняется по исходным значениям.",
            "Эта сводка не определяет вклад отдельных признаков в прогноз модели.",
        ],
    )


def explain_forecast_month(month: ForecastMonth) -> Explanation:
    label = month_label(month.target_month)
    net = month.operating_net_cash_flow
    if net < 0:
        summary = f"{label.capitalize()}: прогнозируемые операционные выплаты превышают поступления на {rubles(-net)}."
    elif net > 0:
        summary = f"{label.capitalize()}: прогнозируемые поступления превышают операционные выплаты на {rubles(net)}."
    else:
        summary = f"{label.capitalize()}: прогнозируемые поступления равны операционным выплатам."
    return Explanation(
        title=f"Денежные потоки: {label}", summary=summary,
        facts=[
            f"Поступления: {rubles(month.cash_inflow.prediction)}; диапазон от {rubles(month.cash_inflow.lower)} до {rubles(month.cash_inflow.upper)}.",
            f"Операционные выплаты: {rubles(month.operating_cash_outflow.prediction)}; диапазон от {rubles(month.operating_cash_outflow.lower)} до {rubles(month.operating_cash_outflow.upper)}.",
        ],
    )


def explain_forecast(months: list[ForecastMonth], nominal_coverage: float, warnings: list[str]) -> Explanation:
    ordered = sorted(months, key=lambda row: row.horizon)
    return Explanation(
        title="Прогноз операционных денежных потоков",
        summary="Месяцы прогноза: " + ", ".join(month_label(row.target_month) for row in ordered) + ".",
        facts=[explain_forecast_month(row).summary for row in ordered],
        next_steps=["Для оценки будущего остатка учтите текущие деньги, обслуживание долга и другие плановые движения."],
        limitations=warning_explanations(warnings) + [
            "Разность поступлений и операционных выплат сама по себе не определяет наличие кассового разрыва.",
            f"Номинальное покрытие диапазонов отдельных потоков — {percent(nominal_coverage)}; фактическое покрытие может отличаться.",
        ],
    )


def explain_cash_gap(calculation: CashGapCalculation, plan: list[PlannedCashMovements], warnings: list[str]) -> Explanation:
    base, adverse = calculation.base, calculation.adverse
    facts = [f"Начальный остаток на конец {month_label(calculation.as_of_month, genitive=True)} года: {rubles(calculation.opening_balance)}."]
    steps = []
    if base.first_cash_gap_month is not None:
        first = next(row for row in base.months if row.month == base.first_cash_gap_month)
        summary = (f"В основном сценарии на конец {month_label(first.month, genitive=True)} года ожидается нехватка {rubles(first.cash_shortfall)}. "
                   f"Для покрытия всех прогнозных дефицитов нужно дополнительное пополнение {rubles(base.funding_to_avoid_cash_gap)} до начала прогноза.")
        steps.append("Проверьте план платежей и возможность переноса выплат или дополнительного финансирования до месяца дефицита.")
    else:
        summary = "В основном сценарии отрицательные остатки на конец прогнозных месяцев не ожидаются."
    facts.append(f"Минимальный остаток с учётом начального: {rubles(base.minimum_balance)}.")
    if base.first_reserve_breach_month is not None and calculation.minimum_cash_reserve > 0:
        facts.append(f"Резерв {rubles(calculation.minimum_cash_reserve)} нарушается начиная с {month_label(base.first_reserve_breach_month, genitive=True)} года.")
        facts.append(f"Для сохранения резерва требуется пополнение {rubles(base.funding_to_maintain_reserve)} до начала прогноза; оно уже включает покрытие отрицательных остатков.")
        if base.first_cash_gap_month is None:
            steps.append("Скорректируйте план движений денег с учётом минимального резерва.")
    if adverse.first_cash_gap_month is not None:
        facts.append(f"Первый месяц с отрицательным остатком в неблагоприятном сценарии: {month_label(adverse.first_cash_gap_month)}; пополнение для покрытия дефицитов — {rubles(adverse.funding_to_avoid_cash_gap)}.")
        if base.first_cash_gap_month is None:
            steps.append("Проверьте запас ликвидности на случай меньших поступлений и больших операционных выплат.")
    else:
        facts.append("В неблагоприятном сценарии отрицательные остатки на конец прогнозных месяцев не ожидаются.")
    if adverse.first_reserve_breach_month is not None and calculation.minimum_cash_reserve > 0:
        facts.append(f"В неблагоприятном сценарии резерв нарушается начиная с {month_label(adverse.first_reserve_breach_month, genitive=True)} года; пополнение для его сохранения — {rubles(adverse.funding_to_maintain_reserve)}.")
        if base.first_reserve_breach_month is None:
            steps.append("Учтите возможное снижение денежного резерва в неблагоприятном сценарии.")

    # Describe supplied movements, without claiming any one payment caused the gap.
    labels = (("debt_service", "обслуживание долга"), ("investments", "инвестиции"),
              ("financing_inflow", "поступление финансирования"), ("other_inflow", "прочие поступления"),
              ("other_outflow", "прочие выплаты"))
    for entry in sorted(plan, key=lambda row: row.month):
        movements = [f"{label} — {rubles(value)}" for field, label in labels if (value := getattr(entry, field)) > 0]
        if movements:
            facts.append(f"План на {month_label(entry.month)}: " + "; ".join(movements) + ".")
    if not steps:
        steps.append("Обновляйте прогноз при изменении поступлений и плана платежей.")
    return Explanation(
        title="Прогноз кассового разрыва", summary=summary, facts=facts, next_steps=steps,
        limitations=warning_explanations(warnings) + [
            "Проверяются остатки на конец месяца; временная нехватка денег внутри месяца может остаться незамеченной.",
            "Неблагоприятный сценарий объединяет границы отдельных прогнозов и не задаёт вероятность кассового разрыва.",
            "Суммы округлены для отображения; для расчётов используйте исходные числовые поля ответа.",
            "Плановые поступления финансирования являются предположениями сценария.",
        ],
    )
