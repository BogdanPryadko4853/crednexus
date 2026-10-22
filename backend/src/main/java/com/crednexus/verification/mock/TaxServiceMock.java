package com.crednexus.verification.mock;

import com.crednexus.company.entity.Company;
import com.crednexus.verification.entity.VerificationStatus;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class TaxServiceMock {

    public MockVerificationOutcome verify(Company company) {
        return verify(company, Set.of());
    }

    public MockVerificationOutcome verify(Company company, Set<String> satisfiedRequirements) {
        return switch (lastDigit(company.getInn())) {
            case 0, 1, 2, 3, 4, 5 -> new MockVerificationOutcome(VerificationStatus.SUCCESS, Map.of(
                    "outcome", "SUCCESS",
                    "companyExists", true,
                    "companyStatus", "ACTIVE",
                    "registrationVerified", true,
                    "missingFields", List.of(),
                    "message", "Сведения ФНС подтверждены"
            ));
            case 6 -> new MockVerificationOutcome(VerificationStatus.FAILED, Map.of(
                    "outcome", "FAILED",
                    "companyExists", false,
                    "companyStatus", "NOT_FOUND",
                    "registrationVerified", false,
                    "missingFields", List.of(),
                    "message", "Компания не подтверждена ФНС"
            ));
            case 7 -> registrationOutcome(satisfiedRequirements);
            default -> new MockVerificationOutcome(VerificationStatus.ERROR, Map.of(
                    "outcome", "ERROR",
                    "errorCode", "MOCK_TIMEOUT",
                    "message", "Сервис ФНС временно недоступен"
            ));
        };
    }

    private int lastDigit(String inn) {
        return Character.digit(inn.charAt(inn.length() - 1), 10);
    }

    private MockVerificationOutcome registrationOutcome(Set<String> satisfiedRequirements) {
        if (satisfiedRequirements.contains("registrationDocument")) {
            return new MockVerificationOutcome(VerificationStatus.SUCCESS, Map.of(
                    "outcome", "SUCCESS", "companyExists", true, "companyStatus", "ACTIVE",
                    "registrationVerified", true, "missingFields", List.of(),
                    "message", "Регистрационный документ подтверждён"
            ));
        }
        return new MockVerificationOutcome(VerificationStatus.SUCCESS, Map.of(
                "outcome", "NEEDS_INFO", "companyExists", true, "companyStatus", "ACTIVE",
                "registrationVerified", false, "missingFields", List.of("registrationDocument"),
                "message", "Для проверки ФНС требуются дополнительные сведения"
        ));
    }
}
