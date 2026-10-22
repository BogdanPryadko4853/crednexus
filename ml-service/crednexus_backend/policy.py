"""Explicit demo product policy; thresholds are scenario assumptions, not bank policy."""
from decimal import Decimal, ROUND_DOWN

from crednexus_ml.contracts import Application, ScoreRequest
from crednexus_ml.features import build_score_features
from crednexus_ml.responses import ScoreResponse
from .contracts import CreditDecision, DecisionReason, ProductDefinition
from .explanations import explain_decision


DEMO_PRODUCT = ProductDefinition(
    code="working-capital", name="Оборотный кредит — демонстрационный",
    annual_rate=.18, min_amount=50_000., max_amount=3_000_000., min_term_months=3, max_term_months=36,
    purposes=["working_capital"], minimum_business_age_months=12, minimum_cash_flow_coverage=1.2,
    review_probability=.10, reject_probability=.20, policy_version="demo-credit-v1",
)


def _decide(request: ScoreRequest, score: ScoreResponse, product: ProductDefinition) -> CreditDecision:
    row = build_score_features(request).iloc[0]
    reasons = []
    def reason(code, message):
        return DecisionReason(code=code, message=message)

    checks = [
        (request.application.purpose not in product.purposes, "UNSUPPORTED_PURPOSE", "Цель не соответствует продукту"),
        (not product.min_term_months <= request.application.term_months <= product.max_term_months, "TERM_OUTSIDE_PRODUCT", "Срок вне условий продукта"),
        (request.company.business_age_months < product.minimum_business_age_months, "BUSINESS_TOO_YOUNG", "Недостаточный возраст бизнеса для продукта"),
        (request.application.requested_amount < product.min_amount, "AMOUNT_BELOW_MINIMUM", "Сумма ниже минимума продукта"),
        (row.bureau_dpd_current >= 90, "CURRENT_90DPD", "Есть текущая просрочка 90 и более дней"),
        (score.default_next12m >= product.reject_probability, "HIGH_SCENARIO_RISK", "Риск выше демонстрационного порога продукта"),
    ]
    reasons.extend(reason(code, message) for failed, code, message in checks if failed)
    coverage = float(row.cash_flow_coverage)
    common = dict(policy_version=product.policy_version, risk_evaluated_amount=request.application.requested_amount,
                  cash_flow_coverage=coverage)
    if reasons:
        return CreditDecision(status="REJECTED", reasons=reasons, **common)

    review = []
    if score.default_next12m >= product.review_probability:
        review.append(reason("RISK_REQUIRES_REVIEW", "Риск требует рассмотрения сотрудником"))
    if row.bureau_dpd_current > 0:
        review.append(reason("CURRENT_ARREARS", "Есть текущая просрочка"))
    if request.financial_snapshot.business_state != "active":
        review.append(reason("BUSINESS_STATE_REQUIRES_REVIEW", "Финансовое состояние требует рассмотрения"))
    if any(warning.startswith(("INCOMPLETE_HISTORY", "UNKNOWN_CATEGORY", "SHORT_HISTORY")) for warning in score.warnings):
        review.append(reason("DATA_QUALITY_REQUIRES_REVIEW", "История неполная или категории не встречались при обучении"))
    if review:
        return CreditDecision(status="REVIEW_REQUIRED", reasons=review, **common)

    free_cash = float(row.cash_inflow_mean_6 - row.operating_cash_outflow_mean_6)
    payment_capacity = free_cash / product.minimum_cash_flow_coverage - request.financial_snapshot.existing_monthly_debt_service
    rate = product.annual_rate / 12
    factor = rate / (1 - (1 + rate) ** (-request.application.term_months))
    affordable = max(0., payment_capacity / factor)
    amount = min(request.application.requested_amount, product.max_amount, affordable)
    amount = float(Decimal(str(amount)).quantize(Decimal(".01"), rounding=ROUND_DOWN))
    if amount < product.min_amount:
        return CreditDecision(status="REJECTED", reasons=[reason("INSUFFICIENT_PAYMENT_CAPACITY", "Операционный поток не покрывает минимальный кредит с заданным запасом")], **common)
    offered = Application(requested_amount=amount, term_months=request.application.term_months,
                          annual_rate=product.annual_rate, purpose=request.application.purpose, product_limit=product.max_amount)
    if amount < request.application.requested_amount:
        reasons = []
        if request.application.requested_amount > product.max_amount:
            reasons.append(reason("PRODUCT_LIMIT", "Сумма ограничена лимитом продукта"))
        if affordable < request.application.requested_amount:
            reasons.append(reason("PAYMENT_CAPACITY", "Предложена меньшая сумма с учётом платёжной нагрузки"))
        if not reasons:
            reasons.append(reason("AMOUNT_ROUNDED", "Сумма приведена к целым копейкам"))
        return CreditDecision(status="COUNTER_OFFER", offered_conditions=offered, reasons=reasons, **common)
    return CreditDecision(status="APPROVED", offered_conditions=offered,
                          reasons=[reason("POLICY_PASSED", "Демонстрационные проверки риска, продукта и нагрузки пройдены")], **common)


def decide(request: ScoreRequest, score: ScoreResponse, product: ProductDefinition) -> CreditDecision:
    decision = _decide(request, score, product)
    decision.explanation = explain_decision(request, score, product, decision)
    return decision
