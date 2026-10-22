package com.crednexus.scoring.provider;

import com.crednexus.scoring.entity.RiskLevel;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "scoring.provider", havingValue = "mock")
public class MockScoringProvider implements ScoringProvider {

    @Override
    public ScoringOutput score(ScoringInput input) {
        int score = Math.floorMod(input.applicationId().hashCode(), 66) + 20;
        RiskLevel riskLevel = score >= 70 ? RiskLevel.LOW : score >= 50 ? RiskLevel.MEDIUM : RiskLevel.HIGH;
        Map<String, Object> factors = new LinkedHashMap<>();
        factors.put("mock", true);
        factors.put("message", "Детерминированный результат mock-провайдера до подключения ML API");
        factors.put("inputVersion", "scoring-input-v1");
        return new ScoringOutput(score, riskLevel, factors, "mock-v1");
    }
}
