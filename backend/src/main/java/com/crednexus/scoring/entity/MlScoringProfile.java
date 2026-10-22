package com.crednexus.scoring.entity;

import com.crednexus.application.entity.LoanApplication;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "ml_scoring_profiles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MlScoringProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, unique = true)
    private LoanApplication application;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode payload;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public MlScoringProfile(LoanApplication application, JsonNode payload) {
        this.application = application;
        this.payload = payload;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void replace(JsonNode payload) {
        this.payload = payload;
        this.updatedAt = Instant.now();
    }
}
