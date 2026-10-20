package com.crednexus.company.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Table(
        name = "companies",
        uniqueConstraints = @UniqueConstraint(name = "uk_companies_inn", columnNames = "inn")
)
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 12)
    @Setter
    private String inn;

    @Column(name = "ogrn_or_ogrnip", nullable = false)
    @Setter
    private String ogrnOrOgrnip;

    @Column(nullable = false)
    @Setter
    private String name;

    @Column(name = "legal_form", nullable = false)
    @Setter
    private String legalForm;

    @Column(nullable = false)
    @Setter
    private String status;

    protected Company() {
    }

    public Company(String inn, String ogrnOrOgrnip, String name, String legalForm, String status) {
        this.inn = inn;
        this.ogrnOrOgrnip = ogrnOrOgrnip;
        this.name = name;
        this.legalForm = legalForm;
        this.status = status;
    }

}
