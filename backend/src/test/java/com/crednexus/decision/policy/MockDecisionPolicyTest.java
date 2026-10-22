package com.crednexus.decision.policy;

import static org.assertj.core.api.Assertions.assertThat;

import com.crednexus.decision.entity.DecisionType;
import com.crednexus.scoring.entity.RiskLevel;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MockDecisionPolicyTest {

    private final MockDecisionPolicy policy = new MockDecisionPolicy();

    @Test
    void approvesLowRiskOnRequestedTerms() {
        DecisionOutput output = policy.evaluate(input(RiskLevel.LOW));

        assertThat(output.action()).isEqualTo(DecisionAction.OFFER);
        assertThat(output.decisionType()).isEqualTo(DecisionType.APPROVED);
        assertThat(output.offerTerms().amount()).isEqualByComparingTo("2000000.00");
        assertThat(output.policyVersion()).isEqualTo("mock-policy-v1");
    }

    @Test
    void routesMediumRiskToManualReview() {
        DecisionOutput output = policy.evaluate(input(RiskLevel.MEDIUM));

        assertThat(output.action()).isEqualTo(DecisionAction.MANUAL_REVIEW);
        assertThat(output.decisionType()).isNull();
        assertThat(output.offerTerms()).isNull();
    }

    @Test
    void rejectsHighRisk() {
        DecisionOutput output = policy.evaluate(input(RiskLevel.HIGH));

        assertThat(output.action()).isEqualTo(DecisionAction.REJECT);
        assertThat(output.decisionType()).isEqualTo(DecisionType.REJECTED);
    }

    private DecisionInput input(RiskLevel riskLevel) {
        return new DecisionInput(
                UUID.randomUUID(), new BigDecimal("2000000.00"), 24,
                new BigDecimal("15.00"), 75, riskLevel
        );
    }
}
