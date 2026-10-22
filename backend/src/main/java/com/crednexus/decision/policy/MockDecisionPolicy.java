package com.crednexus.decision.policy;

import com.crednexus.decision.entity.DecisionType;
import com.crednexus.scoring.entity.RiskLevel;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "decision.policy", havingValue = "mock", matchIfMissing = true)
public class MockDecisionPolicy implements DecisionPolicy {

    private static final String POLICY_VERSION = "mock-policy-v1";

    @Override
    public DecisionOutput evaluate(DecisionInput input) {
        if (input.riskLevel() == RiskLevel.LOW) {
            return new DecisionOutput(
                    DecisionAction.OFFER,
                    DecisionType.APPROVED,
                    "Автоматическое одобрение: низкий уровень риска.",
                    new DecisionOutput.OfferTerms(
                            input.requestedAmount(), input.requestedTermMonths(), input.baseRate()
                    ),
                    POLICY_VERSION
            );
        }
        if (input.riskLevel() == RiskLevel.MEDIUM) {
            return new DecisionOutput(
                    DecisionAction.MANUAL_REVIEW,
                    null,
                    "Требуется ручное рассмотрение: средний уровень риска.",
                    null,
                    POLICY_VERSION
            );
        }
        return new DecisionOutput(
                DecisionAction.REJECT,
                DecisionType.REJECTED,
                "Автоматический отказ: высокий уровень риска.",
                null,
                POLICY_VERSION
        );
    }
}
