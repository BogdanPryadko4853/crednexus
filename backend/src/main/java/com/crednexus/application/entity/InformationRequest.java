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
@Table(name = "information_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InformationRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, foreignKey = @ForeignKey(name = "fk_information_requests_application"))
    @Setter
    private LoanApplication application;

    @Column(nullable = false, columnDefinition = "text")
    @Setter
    private String question;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private InformationRequestStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by", foreignKey = @ForeignKey(name = "fk_information_requests_requested_by"))
    @Setter
    private User requestedBy;

    @Column(columnDefinition = "text")
    @Setter
    private String answer;

    @Column(name = "answered_at")
    @Setter
    private Instant answeredAt;
}
