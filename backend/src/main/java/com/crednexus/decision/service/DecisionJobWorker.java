package com.crednexus.decision.service;

import com.crednexus.workflow.entity.WorkflowJobType;
import com.crednexus.workflow.service.WorkflowJobRecoveryService;
import com.crednexus.workflow.service.WorkflowJobService;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DecisionJobWorker {

    private final WorkflowJobService workflowJobService;
    private final DecisionJobProcessor decisionJobProcessor;
    private final WorkflowJobRecoveryService workflowJobRecoveryService;
    private final Duration lease;

    public DecisionJobWorker(
            WorkflowJobService workflowJobService,
            DecisionJobProcessor decisionJobProcessor,
            WorkflowJobRecoveryService workflowJobRecoveryService,
            @Value("${workflow.jobs.lock-duration:PT1M}") Duration lease
    ) {
        this.workflowJobService = workflowJobService;
        this.decisionJobProcessor = decisionJobProcessor;
        this.workflowJobRecoveryService = workflowJobRecoveryService;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${workflow.jobs.poll-delay-ms:5000}")
    public void poll() {
        workflowJobService.claimReadyJobs(WorkflowJobType.DECISION, lease).forEach(this::process);
    }

    private void process(UUID jobId) {
        try {
            decisionJobProcessor.process(jobId);
        } catch (RuntimeException exception) {
            workflowJobRecoveryService.recover(jobId, "Ошибка принятия решения: " + exception.getMessage());
        }
    }
}
