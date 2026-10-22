"""Customer-facing wording of actual policy reasons; no inferred model attribution."""
from crednexus_ml.contracts import ScoreRequest
from crednexus_ml.explanations import Explanation, percent, rubles, SYNTHETIC_LIMITATION, warning_explanations
from crednexus_ml.responses import ScoreResponse
from .contracts import CreditDecision, ProductDefinition


def explain_decision(request: ScoreRequest, score: ScoreResponse, product: ProductDefinition, decision: CreditDecision) -> Explanation:
    current_dpd = next(row.dpd for row in request.bureau_history if row.month == request.as_of_month)
    coverage = str(product.minimum_cash_flow_coverage).replace(".", ",")
    details = {
        "UNSUPPORTED_PURPOSE": "Выбранная цель финансирования не входит в условия этого продукта.",
        "TERM_OUTSIDE_PRODUCT": f"Запрошенный срок — {request.application.term_months} мес.; доступный срок — от {product.min_term_months} до {product.max_term_months} мес.",
        "BUSINESS_TOO_YOUNG": f"Возраст бизнеса — {request.company.business_age_months} мес.; минимум для продукта — {product.minimum_business_age_months} мес.",
        "AMOUNT_BELOW_MINIMUM": f"Запрошено {rubles(request.application.requested_amount)}; минимум продукта — {rubles(product.min_amount)}.",
        "CURRENT_90DPD": f"Текущая просрочка по предоставленным данным — {current_dpd} дн.; правило отказа применяется от 90 дней.",
        "HIGH_SCENARIO_RISK": f"Оценка риска — {percent(score.default_next12m)}; демонстрационный порог отказа — {percent(product.reject_probability)}.",
        "RISK_REQUIRES_REVIEW": f"Оценка риска — {percent(score.default_next12m)}; демонстрационный порог рассмотрения сотрудником — {percent(product.review_probability)}.",
        "CURRENT_ARREARS": f"В предоставленной истории есть текущая просрочка: {current_dpd} дн.",
        "BUSINESS_STATE_REQUIRES_REVIEW": "Указанное финансовое состояние бизнеса требует рассмотрения сотрудником.",
        "DATA_QUALITY_REQUIRES_REVIEW": "Для автоматического решения недостаточно качества данных: история неполная или характеристики отсутствуют в обучающем наборе.",
        "INSUFFICIENT_PAYMENT_CAPACITY": f"После учёта существующих долгов и запаса покрытия {coverage} операционного потока недостаточно для минимального кредита {rubles(product.min_amount)}.",
        "PRODUCT_LIMIT": f"Запрошено {rubles(request.application.requested_amount)}; максимальная сумма продукта — {rubles(product.max_amount)}.",
        "PAYMENT_CAPACITY": f"Сумма ограничена платёжной способностью с учётом существующих долгов и запаса покрытия {coverage}.",
        "AMOUNT_ROUNDED": "Сумма предложения округлена вниз до целых копеек.",
        "POLICY_PASSED": "Проверки условий продукта, сценарного риска и платёжной нагрузки пройдены.",
    }
    facts = [details.get(reason.code, reason.message) for reason in decision.reasons]
    offered = decision.offered_conditions
    if offered is not None:
        facts.append(f"Предложенные условия: {rubles(offered.requested_amount)}, срок {offered.term_months} мес., ставка {percent(offered.annual_rate)} годовых.")
    if decision.status == "APPROVED":
        title = "Заявка одобрена в демонстрационном сценарии"
        summary = "Заявка соответствует проверенным условиям демонстрационного продукта."
        steps = ["Проверьте сумму, срок и ставку в предложенных условиях."]
    elif decision.status == "COUNTER_OFFER":
        title = "Предложены изменённые условия"
        summary = (f"Предложена сумма {rubles(offered.requested_amount)} вместо запрошенных {rubles(request.application.requested_amount)}."
                   if offered is not None else "Для заявки предложены изменённые условия.")
        steps = ["Проверьте предложенные условия. Их принятие запустит новую оценку риска для принятой суммы."]
    elif decision.status == "REVIEW_REQUIRED":
        title = "Требуется рассмотрение сотрудником"
        summary = "Для решения по этой заявке требуется участие сотрудника."
        steps = ["Проверьте актуальность финансовой истории и сведений о просрочках."]
    else:
        title = "Заявка отклонена по демонстрационным правилам"
        summary = "Заявка не прошла перечисленные проверки демонстрационного продукта."
        codes = {reason.code for reason in decision.reasons}
        steps = []
        if codes & {"TERM_OUTSIDE_PRODUCT", "UNSUPPORTED_PURPOSE", "AMOUNT_BELOW_MINIMUM"}:
            steps.append("Сопоставьте сумму, срок и цель заявки с условиями продукта.")
        if "BUSINESS_TOO_YOUNG" in codes:
            steps.append("Учитывайте минимальный возраст бизнеса при выборе продукта.")
        if codes & {"HIGH_SCENARIO_RISK", "CURRENT_90DPD"}:
            steps.append("Проверьте актуальность финансовых данных и истории просрочек.")
        if "INSUFFICIENT_PAYMENT_CAPACITY" in codes:
            steps.append("Проверьте поступления, операционные выплаты и платежи по существующим долгам.")
        if not steps:
            steps.append("Ознакомьтесь с причинами решения и условиями продукта.")
    limitations = list(dict.fromkeys([SYNTHETIC_LIMITATION] + warning_explanations(score.warnings)))
    limitations += [
        "Применены демонстрационные правила; результат не подтверждает фактическую выдачу кредита.",
        "Причины описывают проверки правил; вклад отдельных признаков в прогноз модели здесь не рассчитывается.",
        "Числа округлены для отображения; правила сравнивают исходные значения.",
    ]
    return Explanation(title=title, summary=summary, facts=facts, next_steps=steps, limitations=limitations)
