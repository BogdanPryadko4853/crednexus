package com.crednexus.application.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "documents")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, foreignKey = @ForeignKey(name = "fk_documents_application"))
    @Setter
    private LoanApplication application;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false)
    @Setter
    private DocumentType documentType;

    @Column(name = "file_name", nullable = false)
    @Setter
    private String fileName;

    @Column(name = "storage_key", nullable = false)
    @Setter
    private String storageKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Setter
    private DocumentStatus status;
}
