package com.crednexus.product.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Table(name = "credit_products")
public class CreditProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    @Setter
    private String name;

    @Column(name = "min_amount", nullable = false)
    @Setter
    private BigDecimal minAmount;

    @Column(name = "max_amount", nullable = false)
    @Setter
    private BigDecimal maxAmount;

    @Column(name = "min_term_months", nullable = false)
    @Setter
    private Integer minTermMonths;

    @Column(name = "max_term_months", nullable = false)
    @Setter
    private Integer maxTermMonths;

    @Column(name = "base_rate", nullable = false)
    @Setter
    private BigDecimal baseRate;

    @Column(nullable = false)
    @Setter
    private boolean active;

    protected CreditProduct() {
    }

    public CreditProduct(
            String name,
            BigDecimal minAmount,
            BigDecimal maxAmount,
            Integer minTermMonths,
            Integer maxTermMonths,
            BigDecimal baseRate,
            boolean active
    ) {
        this.name = name;
        this.minAmount = minAmount;
        this.maxAmount = maxAmount;
        this.minTermMonths = minTermMonths;
        this.maxTermMonths = maxTermMonths;
        this.baseRate = baseRate;
        this.active = active;
    }

}
