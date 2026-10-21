package com.crednexus.scoring.provider;

import com.crednexus.scoring.entity.RiskLevel;
import java.util.Map;

public record ScoringOutput(
        Integer score,
        RiskLevel riskLevel,
        Map<String, Object> factors,
        String modelVersion
) {
}
