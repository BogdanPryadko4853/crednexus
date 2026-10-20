package com.crednexus.verification.entity;

import com.crednexus.application.entity.LoanApplication;
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
import java.util.Map;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "verification_results")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class VerificationResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, foreignKey = @ForeignKey(name = "fk_verification_results_application"))
    @Setter
    private LoanApplication application;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private VerificationType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private VerificationStatus status;

    @Column(nullable = false)
    @Setter
    private String source;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Setter
    private Map<String, Object> payload;

    @Column(name = "checked_at", nullable = false)
    @Setter
    private Instant checkedAt;

    public VerificationResult(
            LoanApplication application,
            VerificationType type,
            VerificationStatus status,
            String source,
            Map<String, Object> payload,
            Instant checkedAt
    ) {
        this.application = application;
        this.type = type;
        this.status = status;
        this.source = source;
        this.payload = payload;
        this.checkedAt = checkedAt;
    }
}
