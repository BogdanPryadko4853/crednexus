package com.crednexus.contract.entity;

import com.crednexus.decision.entity.CreditOffer;
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
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "loan_agreements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LoanAgreement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "offer_id",
            nullable = false,
            unique = true,
            foreignKey = @ForeignKey(name = "fk_loan_agreements_offer")
    )
    @Setter
    private CreditOffer offer;

    @Column(name = "contract_number", nullable = false)
    @Setter
    private String contractNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private LoanAgreementStatus status;

    @Column(name = "signed_at")
    @Setter
    private Instant signedAt;
}
