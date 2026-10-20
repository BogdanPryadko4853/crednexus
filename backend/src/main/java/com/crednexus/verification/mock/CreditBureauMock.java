package com.crednexus.verification.mock;

import com.crednexus.company.entity.Company;
import com.crednexus.verification.entity.VerificationStatus;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class CreditBureauMock {

    public MockVerificationOutcome verify(Company company) {
        return switch (penultimateDigit(company.getInn())) {
            case 0, 1, 2, 3, 4 -> success("POSITIVE", false, "GOOD", "Кредитная история получена");
            case 5 -> success("ADVERSE", true, "POOR", "Обнаружены неблагоприятные факторы кредитной истории");
            case 6 -> new MockVerificationOutcome(VerificationStatus.FAILED, Map.of(
                    "outcome", "FAILED",
                    "creditHistory", "UNKNOWN",
                    "hasOverdue", false,
                    "paymentDiscipline", "UNKNOWN",
                    "missingFields", List.of(),
                    "message", "Сведения БКИ не прошли бизнес-проверку"
            ));
            case 7 -> new MockVerificationOutcome(VerificationStatus.SUCCESS, Map.of(
                    "outcome", "NEEDS_INFO",
                    "creditHistory", "UNKNOWN",
                    "hasOverdue", false,
                    "paymentDiscipline", "UNKNOWN",
                    "missingFields", List.of("consentToCreditHistoryCheck"),
                    "message", "Для проверки БКИ требуются дополнительные сведения"
            ));
            default -> new MockVerificationOutcome(VerificationStatus.ERROR, Map.of(
                    "outcome", "ERROR",
                    "errorCode", "MOCK_TIMEOUT",
                    "message", "Сервис БКИ временно недоступен"
            ));
        };
    }

    private MockVerificationOutcome success(
            String creditHistory,
            boolean hasOverdue,
            String paymentDiscipline,
            String message
    ) {
        return new MockVerificationOutcome(VerificationStatus.SUCCESS, Map.of(
                "outcome", "SUCCESS",
                "creditHistory", creditHistory,
                "hasOverdue", hasOverdue,
                "paymentDiscipline", paymentDiscipline,
                "missingFields", List.of(),
                "message", message
        ));
    }

    private int penultimateDigit(String inn) {
        return Character.digit(inn.charAt(inn.length() - 2), 10);
    }
}
