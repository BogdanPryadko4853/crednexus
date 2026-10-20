package com.crednexus.contract.entity;

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
@Table(name = "disbursements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Disbursement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "agreement_id",
            nullable = false,
            unique = true,
            foreignKey = @ForeignKey(name = "fk_disbursements_agreement")
    )
    @Setter
    private LoanAgreement agreement;

    @Column(nullable = false, precision = 19, scale = 2)
    @Setter
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private DisbursementStatus status;

    @Column(name = "executed_at")
    @Setter
    private Instant executedAt;
}
