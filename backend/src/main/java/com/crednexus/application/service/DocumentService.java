package com.crednexus.application.service;

import com.crednexus.application.dto.DocumentResponse;
import com.crednexus.application.entity.Document;
import com.crednexus.application.entity.DocumentType;
import com.crednexus.application.entity.InformationRequest;
import com.crednexus.application.entity.InformationRequestStatus;
import com.crednexus.application.entity.LoanApplication;
import com.crednexus.application.entity.LoanApplicationStatus;
import com.crednexus.application.repository.DocumentRepository;
import com.crednexus.application.repository.InformationRequestRepository;
import com.crednexus.application.repository.LoanApplicationRepository;
import com.crednexus.auth.entity.User;
import com.crednexus.auth.service.CurrentUserProvider;
import com.crednexus.company.repository.CompanyMemberRepository;
import com.crednexus.workflow.service.WorkflowJobService;
import com.crednexus.workflow.service.WorkflowService;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.GetObjectResponse;

import java.io.InputStream;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DocumentService {
    private static final Set<String> CONTENT_TYPES = Set.of("application/pdf", "image/png", "image/jpeg");
    private final DocumentRepository documents;
    private final LoanApplicationRepository applications;
    private final CurrentUserProvider users;
    private final CompanyMemberRepository members;
    private final MinioClient minio;
    private final String bucket;
    private final long maxSize;
    private final InformationRequestRepository informationRequests; private final WorkflowService workflowService; private final WorkflowJobService jobService;

    public DocumentService(DocumentRepository documents, LoanApplicationRepository applications, CurrentUserProvider users,
                           CompanyMemberRepository members, MinioClient minio, @Value("${storage.s3.bucket}") String bucket,
                           @Value("${document.max-size-bytes}") long maxSize, InformationRequestRepository informationRequests,
                           WorkflowService workflowService, WorkflowJobService jobService) {
        this.documents = documents;
        this.applications = applications;
        this.users = users;
        this.members = members;
        this.minio = minio;
        this.bucket = bucket;
        this.maxSize = maxSize;
        this.informationRequests=informationRequests; this.workflowService=workflowService; this.jobService=jobService;
    }

    @Transactional
    public DocumentResponse upload(UUID applicationId, DocumentType type, MultipartFile file, UUID informationRequestId) {
        LoanApplication application = application(applicationId);
        requireAccess(application, true);
        InformationRequest request = informationRequestId == null ? null : informationRequests.findByIdAndApplication_Id(informationRequestId, applicationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Information request not found"));
        if (request != null && (application.getStatus() != LoanApplicationStatus.NEEDS_INFO || request.getStatus() != InformationRequestStatus.OPEN)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Information request is not open");
        validate(file);
        String key = "applications/" + applicationId + "/" + UUID.randomUUID() + "-" + safeName(file.getOriginalFilename());
        try (InputStream input = file.getInputStream()) {
            minio.putObject(PutObjectArgs.builder().bucket(bucket).object(key).stream(input, file.getSize(), -1).contentType(file.getContentType()).build());
            try {
                Document saved=documents.saveAndFlush(new Document(application, type, safeName(file.getOriginalFilename()), key, file.getContentType(), file.getSize(), request));
                if(request!=null){ request.answer("Приложен документ: " + saved.getFileName(), java.time.Instant.now()); if(!informationRequests.existsByApplication_IdAndStatus(applicationId, InformationRequestStatus.OPEN)){ workflowService.transition(application, LoanApplicationStatus.SUBMITTED, users.getCurrentUser(), "Клиент приложил документы по всем запросам уточнений"); jobService.enqueueVerification(application); } }
                return response(saved);
            } catch (RuntimeException exception) {
                minio.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
                throw exception;
            }
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Document storage is unavailable", exception);
        }
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> list(UUID applicationId) {
        LoanApplication app = application(applicationId);
        requireAccess(app, false);
        return documents.findAllByApplication_IdOrderByCreatedAtDesc(applicationId).stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public Download download(UUID documentId) {
        Document document = documents.findById(documentId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));
        requireAccess(document.getApplication(), false);
        try {
            GetObjectResponse stream = minio.getObject(GetObjectArgs.builder().bucket(bucket).object(document.getStorageKey()).build());
            return new Download(document.getFileName(), document.getContentType(), document.getSizeBytes(), stream);
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Document storage is unavailable", exception);
        }
    }

    private LoanApplication application(UUID id) {
        return applications.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
    }

    private void requireAccess(LoanApplication app, boolean canApply) {
        User user = users.getCurrentUser();
        members.findByUser_IdAndCompany_Id(user.getId(), app.getCompany().getId()).filter(m -> m.isActive() && (!canApply || m.isCanApply())).orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company authority is denied"));
    }

    private void validate(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > maxSize || file.getOriginalFilename() == null || file.getOriginalFilename().isBlank() || !CONTENT_TYPES.contains(file.getContentType()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported document file");
    }

    private String safeName(String name) {
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private DocumentResponse response(Document d) {
        return new DocumentResponse(d.getId(), d.getDocumentType(), d.getFileName(), d.getContentType(), d.getSizeBytes(), d.getStatus(), d.getCreatedAt(), d.getInformationRequest() == null ? null : d.getInformationRequest().getId());
    }

    public record Download(String fileName, String contentType, long size, InputStream stream) {
    }
}
