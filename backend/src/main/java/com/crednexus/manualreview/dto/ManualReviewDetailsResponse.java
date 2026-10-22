package com.crednexus.manualreview.dto;

import com.crednexus.application.dto.ApplicationStatusHistoryResponse;
import com.crednexus.application.dto.DocumentResponse;
import com.crednexus.application.dto.FinancialSnapshotResponse;
import com.crednexus.application.dto.InformationRequestResponse;
import com.crednexus.decision.dto.CreditDecisionResponse;
import com.crednexus.scoring.entity.RiskLevel;
import com.crednexus.verification.dto.VerificationResultResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public record ManualReviewDetailsResponse(
        ManualReviewApplicationResponse application,
        CompanyDetails company,
        FinancialSnapshotResponse financialSnapshot,
        List<VerificationResultResponse> verifications,
        ScoringDetails scoring,
        List<DocumentResponse> documents,
        List<InformationRequestResponse> informationRequests,
        List<ApplicationStatusHistoryResponse> statusHistory,
        List<CreditDecisionResponse> decisions
) {
    public record CompanyDetails(String name, String inn, String ogrnOrOgrnip, String legalForm, String status) { }
    public record ScoringDetails(Integer score, RiskLevel riskLevel, Map<String, Object> factors, String modelVersion,
                                 Instant calculatedAt) { }
}
