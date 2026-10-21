package com.crednexus.scoring.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.verification.entity.VerificationStatus;
import com.crednexus.verification.entity.VerificationType;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RuleBasedScoringProviderTest {

    private final RuleBasedScoringProvider provider = new RuleBasedScoringProvider();

    @Test
    void scoresProfitableCompanyWithPositiveCreditHistoryAsLowRisk() {
        ScoringOutput output = provider.score(input(
                new BigDecimal("10000000"), new BigDecimal("6000000"), BigDecimal.ZERO,
                new BigDecimal("100000"), new BigDecimal("1000000"), "POSITIVE", false
        ));

        assertThat(output.score()).isEqualTo(95);
        assertThat(output.riskLevel()).isEqualTo(RiskLevel.LOW);
        assertThat(output.modelVersion()).isEqualTo("rule-based-v1");
    }

    @Test
    void penalizesLossesDebtAndAdverseCreditHistory() {
        ScoringOutput output = provider.score(input(
                new BigDecimal("1000000"), new BigDecimal("1500000"), new BigDecimal("2000000"),
                new BigDecimal("60000"), new BigDecimal("1000000"), "ADVERSE", true
        ));

        assertThat(output.score()).isEqualTo(0);
        assertThat(output.riskLevel()).isEqualTo(RiskLevel.HIGH);
    }

    private ScoringInput input(BigDecimal revenue, BigDecimal expenses, BigDecimal debt, BigDecimal payments,
                               BigDecimal requestedAmount, String creditHistory, boolean overdue) {
        return new ScoringInput(
                UUID.randomUUID(), requestedAmount, 24,
                new ScoringInput.FinancialData(revenue, expenses, debt, payments, 10, "2025"),
                Map.of(VerificationType.CREDIT_BUREAU,
                        new ScoringInput.VerificationData(VerificationStatus.SUCCESS,
                                Map.of("creditHistory", creditHistory, "hasOverdue", overdue)))
        );
    }
}
