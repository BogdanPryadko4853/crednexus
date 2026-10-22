package com.crednexus.scoring.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MockScoringProviderTest {

    private final MockScoringProvider provider = new MockScoringProvider();

    @Test
    void returnsSameResultForTheSameApplication() {
        ScoringInput input = input(UUID.fromString("00000000-0000-0000-0000-000000000042"));

        ScoringOutput first = provider.score(input);
        ScoringOutput second = provider.score(input);

        assertThat(first).isEqualTo(second);
        assertThat(first.score()).isBetween(0, 100);
        assertThat(first.factors()).containsEntry("mock", true);
        assertThat(first.modelVersion()).isEqualTo("mock-v1");
    }

    private ScoringInput input(UUID applicationId) {
        return new ScoringInput(
                applicationId,
                new BigDecimal("100000.00"),
                12,
                new ScoringInput.FinancialData(
                        new BigDecimal("1000000.00"), new BigDecimal("700000.00"), BigDecimal.ZERO,
                        BigDecimal.ZERO, 5, "2025"
                ),
                Map.of()
        );
    }
}
