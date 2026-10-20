package com.crednexus.company.entity;

import com.crednexus.auth.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@Table(
        name = "company_members",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_company_members_user_company",
                columnNames = {"user_id", "company_id"}
        )
)
public class CompanyMember {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "user_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_company_members_user")
    )
    @Setter
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "company_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_company_members_company")
    )
    @Setter
    private Company company;

    @Column(nullable = false)
    @Setter
    private String position;

    @Column(name = "can_apply", nullable = false)
    @Setter
    private boolean canApply;

    @Column(nullable = false)
    @Setter
    private boolean active;

    protected CompanyMember() {
    }

    public CompanyMember(User user, Company company, String position, boolean canApply, boolean active) {
        this.user = user;
        this.company = company;
        this.position = position;
        this.canApply = canApply;
        this.active = active;
    }

}
