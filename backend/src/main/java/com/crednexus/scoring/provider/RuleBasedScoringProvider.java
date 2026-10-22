package com.crednexus.scoring.provider;

import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.verification.entity.VerificationType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "scoring.provider", havingValue = "rule-based", matchIfMissing = true)
public class RuleBasedScoringProvider implements ScoringProvider {

    @Override
    public ScoringOutput score(ScoringInput input) {
        List<Map<String, Object>> factors = new ArrayList<>();
        int score = 50;
        score += profitability(input, factors);
        score += paymentBurden(input, factors);
        score += existingDebt(input, factors);
        score += requestedAmount(input, factors);
        score += creditHistory(input, factors);
        score = Math.max(0, Math.min(100, score));
        RiskLevel riskLevel = score >= 70 ? RiskLevel.LOW : score >= 50 ? RiskLevel.MEDIUM : RiskLevel.HIGH;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("baseScore", 50);
        payload.put("factors", factors);
        payload.put("finalScore", score);
        return new ScoringOutput(score, riskLevel, payload, "rule-based-v1");
    }

    private int profitability(ScoringInput input, List<Map<String, Object>> factors) {
        BigDecimal revenue = input.financialData().annualRevenue();
        BigDecimal margin = revenue.signum() == 0 ? BigDecimal.ZERO
                : revenue.subtract(input.financialData().annualExpenses()).divide(revenue, 4, RoundingMode.HALF_UP);
        if (margin.compareTo(new BigDecimal("0.20")) >= 0) return factor(factors, "profitability", margin, 15);
        if (margin.signum() >= 0) return factor(factors, "profitability", margin, 5);
        return factor(factors, "profitability", margin, -15);
    }

    private int paymentBurden(ScoringInput input, List<Map<String, Object>> factors) {
        BigDecimal monthlyRevenue = input.financialData().annualRevenue().divide(new BigDecimal("12"), 4, RoundingMode.HALF_UP);
        BigDecimal burden = monthlyRevenue.signum() == 0 ? BigDecimal.ONE
                : input.financialData().monthlyPayments().divide(monthlyRevenue, 4, RoundingMode.HALF_UP);
        if (burden.compareTo(new BigDecimal("0.30")) <= 0) return factor(factors, "paymentBurden", burden, 5);
        if (burden.compareTo(new BigDecimal("0.50")) > 0) return factor(factors, "paymentBurden", burden, -20);
        return factor(factors, "paymentBurden", burden, 0);
    }

    private int existingDebt(ScoringInput input, List<Map<String, Object>> factors) {
        BigDecimal revenue = input.financialData().annualRevenue();
        BigDecimal ratio = revenue.signum() == 0 ? BigDecimal.ONE
                : input.financialData().existingDebt().divide(revenue, 4, RoundingMode.HALF_UP);
        return factor(factors, "existingDebtToRevenue", ratio, ratio.compareTo(BigDecimal.ONE) > 0 ? -10 : 0);
    }

    private int requestedAmount(ScoringInput input, List<Map<String, Object>> factors) {
        BigDecimal revenue = input.financialData().annualRevenue();
        BigDecimal ratio = revenue.signum() == 0 ? BigDecimal.ONE
                : input.requestedAmount().divide(revenue, 4, RoundingMode.HALF_UP);
        if (ratio.compareTo(new BigDecimal("0.25")) <= 0) return factor(factors, "requestedAmountToRevenue", ratio, 5);
        if (ratio.compareTo(new BigDecimal("0.75")) > 0) return factor(factors, "requestedAmountToRevenue", ratio, -10);
        return factor(factors, "requestedAmountToRevenue", ratio, 0);
    }

    private int creditHistory(ScoringInput input, List<Map<String, Object>> factors) {
        ScoringInput.VerificationData bureau = input.verifications().get(VerificationType.CREDIT_BUREAU);
        if (bureau == null) return factor(factors, "creditHistory", "MISSING", -20);
        boolean overdue = Boolean.TRUE.equals(bureau.payload().get("hasOverdue"));
        String history = String.valueOf(bureau.payload().get("creditHistory"));
        if (overdue || "ADVERSE".equals(history)) return factor(factors, "creditHistory", history, -35);
        if ("POSITIVE".equals(history)) return factor(factors, "creditHistory", history, 20);
        return factor(factors, "creditHistory", history, 0);
    }

    private int factor(List<Map<String, Object>> factors, String name, Object value, int delta) {
        factors.add(Map.of("name", name, "value", value, "delta", delta));
        return delta;
    }
}
