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
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DocumentService {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("application/pdf", "image/png", "image/jpeg");

    private final DocumentRepository documents;
    private final LoanApplicationRepository applications;
    private final CurrentUserProvider users;
    private final CompanyMemberRepository members;
    private final MinioClient minio;
    private final String bucket;
    private final long maxSize;
    private final InformationRequestRepository informationRequests;
    private final WorkflowService workflowService;
    private final WorkflowJobService jobService;

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
        this.informationRequests = informationRequests;
        this.workflowService = workflowService;
        this.jobService = jobService;
    }

    @Transactional
    public DocumentResponse upload(UUID applicationId, DocumentType type, MultipartFile file, UUID informationRequestId) {
        LoanApplication application = application(applicationId);
        requireAccess(application, true);
        if (type == DocumentType.LOAN_AGREEMENT) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A client cannot upload a loan agreement");
        }
        InformationRequest request = request(application, informationRequestId);
        String contentType = validateAndDetectContentType(file);
        String key = "applications/" + applicationId + "/" + UUID.randomUUID() + "-" + safeName(file.getOriginalFilename());
        try (InputStream input = file.getInputStream()) {
            minio.putObject(PutObjectArgs.builder().bucket(bucket).object(key).stream(input, file.getSize(), -1)
                    .contentType(contentType).build());
            registerRollbackCleanup(key);
            Document saved = documents.saveAndFlush(new Document(application, type, safeName(file.getOriginalFilename()), key,
                    contentType, file.getSize(), request));
            closeDocumentRequestIfComplete(application, request, saved);
            return response(saved);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Document storage is unavailable", exception);
        }
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> list(UUID applicationId) {
        LoanApplication application = application(applicationId);
        requireAccess(application, false);
        return documents.findAllByApplication_IdOrderByCreatedAtDesc(applicationId).stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public Download download(UUID documentId) {
        Document document = documents.findById(documentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));
        requireAccess(document.getApplication(), false);
        try {
            GetObjectResponse stream = minio.getObject(GetObjectArgs.builder().bucket(bucket).object(document.getStorageKey()).build());
            return new Download(document.getFileName(), document.getContentType(), document.getSizeBytes(), stream);
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Document storage is unavailable", exception);
        }
    }

    private InformationRequest request(LoanApplication application, UUID informationRequestId) {
        if (informationRequestId == null) return null;
        InformationRequest request = informationRequests.findByIdAndApplication_Id(informationRequestId, application.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Information request not found"));
        if (application.getStatus() != LoanApplicationStatus.NEEDS_INFO || request.getStatus() != InformationRequestStatus.OPEN
                || !request.isRequiresDocument()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Information request does not accept a document");
        }
        return request;
    }

    private void closeDocumentRequestIfComplete(LoanApplication application, InformationRequest request, Document document) {
        if (request == null) return;
        request.answer("Приложен документ: " + document.getFileName(), Instant.now());
        if (!informationRequests.existsByApplication_IdAndStatus(application.getId(), InformationRequestStatus.OPEN)) {
            workflowService.transition(application, LoanApplicationStatus.SUBMITTED, users.getCurrentUser(),
                    "Клиент предоставил все запрошенные документы");
            jobService.enqueueVerification(application);
        }
    }

    private LoanApplication application(UUID id) {
        return applications.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan application not found"));
    }

    private void requireAccess(LoanApplication application, boolean canApply) {
        User user = users.getCurrentUser();
        members.findByUser_IdAndCompany_Id(user.getId(), application.getCompany().getId())
                .filter(member -> member.isActive() && (!canApply || member.isCanApply()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Company authority is denied"));
    }

    private String validateAndDetectContentType(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > maxSize || file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported document file");
        }
        try (InputStream input = file.getInputStream()) {
            String contentType = detectContentType(input.readNBytes(8));
            if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported document file");
            }
            return contentType;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Document cannot be read", exception);
        }
    }

    private String detectContentType(byte[] header) {
        if (header.length >= 5 && header[0] == '%' && header[1] == 'P' && header[2] == 'D' && header[3] == 'F' && header[4] == '-') return "application/pdf";
        if (header.length >= 8 && (header[0] & 0xff) == 0x89 && header[1] == 'P' && header[2] == 'N' && header[3] == 'G'
                && (header[4] & 0xff) == 0x0d && (header[5] & 0xff) == 0x0a && (header[6] & 0xff) == 0x1a && (header[7] & 0xff) == 0x0a) return "image/png";
        if (header.length >= 3 && (header[0] & 0xff) == 0xff && (header[1] & 0xff) == 0xd8 && (header[2] & 0xff) == 0xff) return "image/jpeg";
        return "application/octet-stream";
    }

    private String safeName(String name) {
        String safe = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safe.isBlank() || ".".equals(safe) || "..".equals(safe)) return "document";
        return safe.substring(0, Math.min(safe.length(), 255));
    }

    private void registerRollbackCleanup(String key) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    try {
                        minio.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
                    } catch (Exception ignored) {
                        // The generated object has no persisted DB reference and can be cleaned by bucket lifecycle rules.
                    }
                }
            }
        });
    }

    private DocumentResponse response(Document document) {
        return new DocumentResponse(document.getId(), document.getDocumentType(), document.getFileName(), document.getContentType(),
                document.getSizeBytes(), document.getStatus(), document.getCreatedAt(),
                document.getInformationRequest() == null ? null : document.getInformationRequest().getId());
    }

    public record Download(String fileName, String contentType, long size, InputStream stream) { }
}
