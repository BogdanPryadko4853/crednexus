package com.crednexus.decision.service;

import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OfferExpirationJobProcessor {

    private final WorkflowJobRepository workflowJobRepository;
    private final OfferService offerService;

    public OfferExpirationJobProcessor(WorkflowJobRepository workflowJobRepository, OfferService offerService) {
        this.workflowJobRepository = workflowJobRepository;
        this.offerService = offerService;
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = workflowJobRepository.findByIdForUpdate(jobId).orElseThrow();
        offerService.expireIfDue(job.getApplication().getId());
        job.complete();
    }
}
