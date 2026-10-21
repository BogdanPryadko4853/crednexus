package com.crednexus.workflow.entity;
import com.crednexus.application.entity.LoanApplication;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.*;
@Entity @Table(name="workflow_jobs") @Getter @NoArgsConstructor(access=AccessLevel.PROTECTED)
public class WorkflowJob {
 @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
 @ManyToOne(fetch=FetchType.LAZY, optional=false) @JoinColumn(name="application_id", nullable=false) private LoanApplication application;
 @Enumerated(EnumType.STRING) @Column(name="job_type",nullable=false) private WorkflowJobType jobType;
 @Enumerated(EnumType.STRING) @Column(nullable=false) private WorkflowJobStatus status;
 @Column(nullable=false) private int attempts;
 @Column(name="max_attempts",nullable=false) private int maxAttempts;
 @Column(name="available_at",nullable=false) private Instant availableAt;
 @Column(name="locked_until") private Instant lockedUntil;
 @Column(name="last_error",columnDefinition="text") private String lastError;
 @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
 @Column(name="updated_at",nullable=false) private Instant updatedAt;
 @Column(name="completed_at") private Instant completedAt;
 @Version @Column(nullable=false) private Integer version;
 public WorkflowJob(LoanApplication application, WorkflowJobType type, int maxAttempts) { Instant now=Instant.now(); this.application=application; jobType=type; status=WorkflowJobStatus.PENDING; this.maxAttempts=maxAttempts; availableAt=now.minusSeconds(1); createdAt=now; updatedAt=now; }
 public WorkflowJob(LoanApplication application, WorkflowJobType type, int maxAttempts, Instant availableAt) { this(application,type,maxAttempts); this.availableAt=availableAt; }
 public void claim(Instant until) { status=WorkflowJobStatus.PROCESSING; lockedUntil=until; attempts++; updatedAt=Instant.now(); }
 public void retryAt(Instant at,String error) { status=WorkflowJobStatus.RETRY_SCHEDULED; availableAt=at; lockedUntil=null; lastError=error; updatedAt=Instant.now(); }
 public void complete() { status=WorkflowJobStatus.COMPLETED; lockedUntil=null; completedAt=Instant.now(); updatedAt=completedAt; }
 public void fail(String error) { status=WorkflowJobStatus.FAILED; lockedUntil=null; lastError=error; completedAt=Instant.now(); updatedAt=completedAt; }
}
