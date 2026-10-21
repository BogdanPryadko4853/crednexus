package com.crednexus.application.entity;

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
@Table(name = "application_status_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, foreignKey = @ForeignKey(name = "fk_status_history_application"))
    @Setter
    private LoanApplication application;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", nullable = false)
    @Setter
    private LoanApplicationStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false)
    @Setter
    private LoanApplicationStatus toStatus;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", foreignKey = @ForeignKey(name = "fk_status_history_actor"))
    @Setter
    private User actor;

    @Column(columnDefinition = "text")
    @Setter
    private String reason;

    @Column(name = "occurred_at", nullable = false)
    @Setter
    private Instant occurredAt;

    public ApplicationStatusHistory(
            LoanApplication application,
            LoanApplicationStatus fromStatus,
            LoanApplicationStatus toStatus,
            User actor,
            String reason,
            Instant occurredAt
    ) {
        this.application = application;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.actor = actor;
        this.reason = reason;
        this.occurredAt = occurredAt;
    }
}
