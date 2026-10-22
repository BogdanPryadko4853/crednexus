package com.crednexus.application.entity;

import com.crednexus.auth.entity.User;
import com.crednexus.verification.entity.VerificationType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "information_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InformationRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, foreignKey = @ForeignKey(name = "fk_information_requests_application"))
    @Setter
    private LoanApplication application;

    @Column(nullable = false, columnDefinition = "text")
    @Setter
    private String question;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private InformationRequestStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by", foreignKey = @ForeignKey(name = "fk_information_requests_requested_by"))
    @Setter
    private User requestedBy;

    @Column(columnDefinition = "text")
    @Setter
    private String answer;

    @Column(name = "answered_at")
    @Setter
    private Instant answeredAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_type")
    @Setter
    private VerificationType verificationType;

    @Column(name = "requirement_code")
    @Setter
    private String requirementCode;

    @Column(name = "requires_document", nullable = false)
    @Setter
    private boolean requiresDocument;

    public InformationRequest(LoanApplication application, String question, User requestedBy) {
        this.application = application;
        this.question = question;
        this.requestedBy = requestedBy;
        this.status = InformationRequestStatus.OPEN;
    }

    public InformationRequest(LoanApplication application, String question, VerificationType verificationType,
                              String requirementCode, boolean requiresDocument) {
        this.application = application;
        this.question = question;
        this.verificationType = verificationType;
        this.requirementCode = requirementCode;
        this.requiresDocument = requiresDocument;
        this.status = InformationRequestStatus.OPEN;
    }

    public void answer(String answer, Instant answeredAt) {
        this.answer = answer;
        this.answeredAt = answeredAt;
        this.status = InformationRequestStatus.ANSWERED;
    }
}
