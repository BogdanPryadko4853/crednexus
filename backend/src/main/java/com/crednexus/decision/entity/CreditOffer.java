package com.crednexus.decision.entity;

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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "credit_offers")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreditOffer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "decision_id",
            nullable = false,
            unique = true,
            foreignKey = @ForeignKey(name = "fk_credit_offers_decision")
    )
    @Setter
    private CreditDecision decision;

    @Column(nullable = false, precision = 19, scale = 2)
    @Setter
    private BigDecimal amount;

    @Column(name = "term_months", nullable = false)
    @Setter
    private Integer termMonths;

    @Column(name = "interest_rate", nullable = false, precision = 5, scale = 2)
    @Setter
    private BigDecimal interestRate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private CreditOfferStatus status;

    @Column(name = "expires_at", nullable = false)
    @Setter
    private Instant expiresAt;

    public CreditOffer(
            CreditDecision decision,
            BigDecimal amount,
            Integer termMonths,
            BigDecimal interestRate,
            CreditOfferStatus status,
            Instant expiresAt
    ) {
        this.decision = decision;
        this.amount = amount;
        this.termMonths = termMonths;
        this.interestRate = interestRate;
        this.status = status;
        this.expiresAt = expiresAt;
    }
}
