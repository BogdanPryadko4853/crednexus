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
public class OfferExpirationJobWorker {

    private final WorkflowJobService workflowJobService;
    private final OfferExpirationJobProcessor processor;
    private final WorkflowJobRecoveryService recoveryService;
    private final Duration lease;

    public OfferExpirationJobWorker(WorkflowJobService workflowJobService, OfferExpirationJobProcessor processor,
                                    WorkflowJobRecoveryService recoveryService,
                                    @Value("${workflow.jobs.lock-duration:PT1M}") Duration lease) {
        this.workflowJobService = workflowJobService;
        this.processor = processor;
        this.recoveryService = recoveryService;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${workflow.jobs.poll-delay-ms:5000}")
    public void poll() {
        workflowJobService.claimReadyJobs(WorkflowJobType.OFFER_EXPIRATION, lease).forEach(this::process);
    }

    private void process(UUID jobId) {
        try {
            processor.process(jobId);
        } catch (RuntimeException exception) {
            recoveryService.recover(jobId, "Ошибка истечения оффера: " + exception.getMessage());
        }
    }
}
