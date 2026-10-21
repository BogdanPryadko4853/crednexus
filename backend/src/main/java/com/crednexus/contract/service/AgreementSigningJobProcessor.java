package com.crednexus.contract.service;

import com.crednexus.workflow.entity.WorkflowJob;
import com.crednexus.workflow.repository.WorkflowJobRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgreementSigningJobProcessor {
    private final WorkflowJobRepository jobRepository;
    private final ContractFulfillmentService fulfillmentService;

    public AgreementSigningJobProcessor(WorkflowJobRepository jobRepository, ContractFulfillmentService fulfillmentService) {
        this.jobRepository = jobRepository;
        this.fulfillmentService = fulfillmentService;
    }

    @Transactional
    public void process(UUID jobId) {
        WorkflowJob job = jobRepository.findByIdForUpdate(jobId).orElseThrow();
        fulfillmentService.signAgreement(job.getApplication().getId());
        job.complete();
    }
}
