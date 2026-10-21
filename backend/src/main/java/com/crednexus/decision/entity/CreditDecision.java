package com.crednexus.decision.entity;

import com.crednexus.application.entity.LoanApplication;
import com.crednexus.auth.entity.User;
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
@Table(name = "credit_decisions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreditDecision {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, foreignKey = @ForeignKey(name = "fk_credit_decisions_application"))
    @Setter
    private LoanApplication application;

    @Enumerated(EnumType.STRING)
    @Column(name = "decision_type", nullable = false)
    @Setter
    private DecisionType decisionType;

    @Column(columnDefinition = "text")
    @Setter
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by", foreignKey = @ForeignKey(name = "fk_credit_decisions_decided_by"))
    @Setter
    private User decidedBy;

    @Column(name = "decided_at", nullable = false)
    @Setter
    private Instant decidedAt;

    @Column(name = "policy_version", nullable = false)
    @Setter
    private String policyVersion;

    public CreditDecision(
            LoanApplication application,
            DecisionType decisionType,
            String reason,
            User decidedBy,
            Instant decidedAt,
            String policyVersion
    ) {
        this.application = application;
        this.decisionType = decisionType;
        this.reason = reason;
        this.decidedBy = decidedBy;
        this.decidedAt = decidedAt;
        this.policyVersion = policyVersion;
    }
}
