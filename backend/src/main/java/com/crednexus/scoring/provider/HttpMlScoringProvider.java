package com.crednexus.scoring.provider;

import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.scoring.repository.MlScoringProfileRepository;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.repository.VerificationResultRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "scoring.provider", havingValue = "ml")
public class HttpMlScoringProvider implements ScoringProvider {
    private final MlScoringProfileRepository profiles;
    private final LoanApplicationRepository applications;
    private final VerificationResultRepository verifications;
    private final ObjectMapper json;
    private final HttpClient client;
    private final URI endpoint;

    public HttpMlScoringProvider(MlScoringProfileRepository profiles, LoanApplicationRepository applications,
                                 VerificationResultRepository verifications, @Qualifier("mlObjectMapper") ObjectMapper json,
                                 @Value("${crednexus.ml.base-url:http://localhost:8001}") String baseUrl) {
        this.profiles = profiles;
        this.applications = applications;
        this.verifications = verifications;
        this.json = json;
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        this.endpoint = URI.create(baseUrl + "/v1/score");
    }

    @Override
    public ScoringOutput score(ScoringInput input) {
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload(input.applicationId())))).build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new IllegalStateException("ML scoring failed with HTTP " + response.statusCode());
            return toOutput(json.readTree(response.body()));
        } catch (Exception exception) {
            throw new IllegalStateException("ML scoring service is unavailable or returned an invalid response", exception);
        }
    }

    private ScoringOutput toOutput(JsonNode response) {
        int score = BigDecimal.valueOf((1d - response.required("default_next12m").asDouble()) * 100d)
                .setScale(0, RoundingMode.HALF_UP).intValue();
        RiskLevel riskLevel = score >= 70 ? RiskLevel.LOW : score >= 50 ? RiskLevel.MEDIUM : RiskLevel.HIGH;
        Map<String, Object> factors = json.convertValue(response, Map.class);
        factors.put("scorePolicy", "ml-pd-v1: round((1-default_next12m)*100)");
        return new ScoringOutput(score, riskLevel, factors, response.required("model_version").asText());
    }

    private JsonNode payload(UUID applicationId) {
        ObjectNode root = (ObjectNode) profiles.findByApplication_Id(applicationId)
                .orElseThrow(() -> new IllegalStateException("ML scoring profile is required")).getPayload().deepCopy();
        var application = applications.findById(applicationId).orElseThrow();
        ObjectNode request = root.putObject("application");
        request.put("requested_amount", application.getRequestedAmount());
        request.put("term_months", application.getTermMonths());
        request.put("annual_rate", application.getProduct().getBaseRate().movePointLeft(2));
        request.put("purpose", application.getPurpose());
        request.put("product_limit", application.getProduct().getMaxAmount());
        addBureauHistory(root, applicationId);
        return root;
    }

    private void addBureauHistory(ObjectNode root, UUID applicationId) {
        boolean overdue = verifications.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(applicationId, VerificationType.CREDIT_BUREAU)
                .map(result -> Boolean.TRUE.equals(result.getPayload().get("hasOverdue"))).orElse(false);
        LocalDate asOfMonth = LocalDate.parse(root.required("as_of_month").asText());
        ArrayNode history = root.putArray("bureau_history");
        for (int offset = 11; offset >= 0; offset--) {
            ObjectNode month = history.addObject();
            month.put("month", asOfMonth.minusMonths(offset).toString());
            month.put("dpd", overdue ? 90 : 0);
        }
    }
}
