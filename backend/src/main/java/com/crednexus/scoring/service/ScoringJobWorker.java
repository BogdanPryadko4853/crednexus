package com.crednexus.scoring.service;

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
public class ScoringJobWorker {

    private final WorkflowJobService workflowJobService;
    private final WorkflowJobRepository workflowJobRepository;
    private final ScoringService scoringService;
    private final Duration lease;

    public ScoringJobWorker(
            WorkflowJobService workflowJobService,
            WorkflowJobRepository workflowJobRepository,
            ScoringService scoringService,
            @Value("${workflow.jobs.lock-duration:PT1M}") Duration lease
    ) {
        this.workflowJobService = workflowJobService;
        this.workflowJobRepository = workflowJobRepository;
        this.scoringService = scoringService;
        this.lease = lease;
    }

    @Scheduled(fixedDelayString = "${workflow.jobs.poll-delay-ms:5000}")
    @Transactional
    public void poll() {
        workflowJobService.claimReadyJobs(WorkflowJobType.SCORING, lease).forEach(this::process);
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        try {
            scoringService.calculate(job.getApplication().getId());
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
