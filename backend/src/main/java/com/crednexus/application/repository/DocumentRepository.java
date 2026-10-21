package com.crednexus.application.repository;

import com.crednexus.application.entity.Document;
import java.util.UUID;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentRepository extends JpaRepository<Document, UUID> {
    List<Document> findAllByApplication_IdOrderByCreatedAtDesc(UUID applicationId);
}
