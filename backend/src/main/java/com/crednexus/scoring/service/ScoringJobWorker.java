package com.crednexus.scoring.service;

import com.crednexus.workflow.entity.WorkflowJobType;
import com.crednexus.workflow.service.WorkflowJobRecoveryService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScoringJobWorker {

    private final WorkflowJobService workflowJobService;
    private final ScoringJobProcessor scoringJobProcessor;
    private final WorkflowJobRecoveryService workflowJobRecoveryService;
    private final Duration lease;

    public ScoringJobWorker(
            WorkflowJobService workflowJobService,
            ScoringJobProcessor scoringJobProcessor,
            WorkflowJobRecoveryService workflowJobRecoveryService,
            @Value("${workflow.jobs.lock-duration:PT1M}") Duration lease
    ) {
        this.workflowJobService = workflowJobService;
        this.scoringJobProcessor = scoringJobProcessor;
        this.workflowJobRecoveryService = workflowJobRecoveryService;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${workflow.jobs.poll-delay-ms:5000}")
    public void poll() {
        workflowJobService.claimReadyJobs(WorkflowJobType.SCORING, lease).forEach(this::process);
    }

    private void process(UUID jobId) {
        try {
            scoringJobProcessor.process(jobId);
        } catch (RuntimeException exception) {
            workflowJobRecoveryService.recover(jobId, "Ошибка скоринга: " + exception.getMessage());
        }
    }
}
