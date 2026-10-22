package com.crednexus.scoring.service;

import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import com.crednexus.workflow.service.WorkflowJobService;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScoringJobProcessor {

    private final WorkflowJobRepository workflowJobRepository;
    private final WorkflowJobService workflowJobService;
    private final ScoringService scoringService;

    public ScoringJobProcessor(WorkflowJobRepository workflowJobRepository, WorkflowJobService workflowJobService,
                               ScoringService scoringService) {
        this.workflowJobRepository = workflowJobRepository;
        this.workflowJobService = workflowJobService;
        this.scoringService = scoringService;
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        scoringService.calculate(job.getApplication().getId());
        job.complete();
        workflowJobService.enqueueDecision(job.getApplication());
    }
}
