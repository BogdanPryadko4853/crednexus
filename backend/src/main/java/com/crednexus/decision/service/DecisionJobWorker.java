package com.crednexus.decision.service;

import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.entity.WorkflowJobType;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import com.crednexus.workflow.service.WorkflowJobService;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DecisionJobWorker {

    private final WorkflowJobService workflowJobService;
    private final WorkflowJobRepository workflowJobRepository;
    private final DecisionService decisionService;
    private final Duration lease;

    public DecisionJobWorker(
            WorkflowJobService workflowJobService,
            WorkflowJobRepository workflowJobRepository,
            DecisionService decisionService,
            @Value("${workflow.jobs.lock-duration:PT1M}") Duration lease
    ) {
        this.workflowJobService = workflowJobService;
        this.workflowJobRepository = workflowJobRepository;
        this.decisionService = decisionService;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${workflow.jobs.poll-delay-ms:5000}")
    @Transactional
    public void poll() {
        workflowJobService.claimReadyJobs(WorkflowJobType.DECISION, lease).forEach(this::process);
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        try {
            decisionService.decide(job.getApplication().getId());
            job.complete();
        } catch (RuntimeException exception) {
            if (job.getAttempts() >= job.getMaxAttempts()) {
                workflowJobService.fail(jobId, exception.getMessage());
            } else {
                workflowJobService.retry(jobId, Duration.ofSeconds(5), exception.getMessage());
            }
        }
    }
}
