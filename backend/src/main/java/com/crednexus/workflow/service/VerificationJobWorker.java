package com.crednexus.workflow.service;

import com.crednexus.workflow.entity.WorkflowJobType;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class VerificationJobWorker {

    private final WorkflowJobService workflowJobService;
    private final VerificationJobProcessor verificationJobProcessor;
    private final WorkflowJobRecoveryService workflowJobRecoveryService;
    private final Duration lease;

    public VerificationJobWorker(
            WorkflowJobService workflowJobService,
            VerificationJobProcessor verificationJobProcessor,
            WorkflowJobRecoveryService workflowJobRecoveryService,
            @Value("${workflow.jobs.lock-duration:PT1M}") Duration lease
    ) {
        this.workflowJobService = workflowJobService;
        this.verificationJobProcessor = verificationJobProcessor;
        this.workflowJobRecoveryService = workflowJobRecoveryService;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${workflow.jobs.poll-delay-ms:5000}")
    public void poll() {
        workflowJobService.claimReadyJobs(WorkflowJobType.VERIFICATION, lease).forEach(this::process);
    }

    private void process(UUID jobId) {
        try {
            verificationJobProcessor.process(jobId);
        } catch (RuntimeException exception) {
            workflowJobRecoveryService.recover(jobId, "Ошибка обработки проверок: " + exception.getMessage());
        }
    }
}
