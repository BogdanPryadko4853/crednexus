package com.crednexus.decision.service;

import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DecisionJobProcessor {

    private final WorkflowJobRepository workflowJobRepository;
    private final DecisionService decisionService;

    public DecisionJobProcessor(WorkflowJobRepository workflowJobRepository, DecisionService decisionService) {
        this.workflowJobRepository = workflowJobRepository;
        this.decisionService = decisionService;
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        decisionService.decide(job.getApplication().getId());
        job.complete();
    }
}
