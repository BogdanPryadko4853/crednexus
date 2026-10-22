package com.crednexus.scoring.provider;

import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.scoring.repository.MlScoringProfileRepository;
import com.crednexus.verification.entity.VerificationType;
import com.crednexus.verification.repository.VerificationResultRepository;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.math.*; import java.net.*; import java.net.http.*; import java.time.*; import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component @ConditionalOnProperty(name="scoring.provider",havingValue="ml")
public class HttpMlScoringProvider implements ScoringProvider {
 private final MlScoringProfileRepository profiles; private final LoanApplicationRepository applications; private final VerificationResultRepository verifications; private final ObjectMapper json; private final HttpClient client; private final URI endpoint;
 public HttpMlScoringProvider(MlScoringProfileRepository profiles,LoanApplicationRepository applications,VerificationResultRepository verifications,ObjectMapper json,@Value("${crednexus.ml.base-url:http://localhost:8001}") String url){this.profiles=profiles;this.applications=applications;this.verifications=verifications;this.json=json;this.client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();this.endpoint=URI.create(url+"/v1/score");}
 public ScoringOutput score(ScoringInput input){ try { JsonNode body=payload(input.applicationId()); HttpRequest req=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(); HttpResponse<String> res=client.send(req,HttpResponse.BodyHandlers.ofString()); if(res.statusCode()!=200) throw new IllegalStateException("ML scoring failed with HTTP "+res.statusCode()); JsonNode r=json.readTree(res.body()); double pd=r.required("default_next12m").asDouble(); int score=BigDecimal.valueOf((1d-pd)*100d).setScale(0,RoundingMode.HALF_UP).intValue(); RiskLevel risk=score>=70?RiskLevel.LOW:score>=50?RiskLevel.MEDIUM:RiskLevel.HIGH; Map<String,Object> factors=json.convertValue(r,Map.class); factors.put("scorePolicy","ml-pd-v1: round((1-default_next12m)*100)"); return new ScoringOutput(score,risk,factors,r.required("model_version").asText()); } catch(Exception e){throw new IllegalStateException("ML scoring service is unavailable or returned an invalid response",e);} }
 private JsonNode payload(UUID id){ ObjectNode root=(ObjectNode)profiles.findByApplication_Id(id).orElseThrow(()->new IllegalStateException("ML scoring profile is required")).getPayload().deepCopy(); var a=applications.findById(id).orElseThrow(); ObjectNode app=root.putObject("application"); app.put("requested_amount",a.getRequestedAmount()); app.put("term_months",a.getTermMonths()); app.put("annual_rate",a.getProduct().getBaseRate().movePointLeft(2)); app.put("purpose",a.getPurpose()); app.put("product_limit",a.getProduct().getMaxAmount()); ArrayNode bureau=root.putArray("bureau_history"); boolean overdue=verifications.findTopByApplication_IdAndTypeOrderByCheckedAtDesc(id,VerificationType.CREDIT_BUREAU).map(v->Boolean.TRUE.equals(v.getPayload().get("hasOverdue"))).orElse(false); LocalDate end=LocalDate.parse(root.required("as_of_month").asText()); for(int i=11;i>=0;i--){ObjectNode row=bureau.addObject();row.put("month",end.minusMonths(i).toString());row.put("dpd",overdue?90:0);} return root; }
}
