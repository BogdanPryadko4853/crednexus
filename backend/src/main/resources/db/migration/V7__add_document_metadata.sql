ALTER TABLE documents
    ADD COLUMN content_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
    ADD COLUMN size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_documents_application_id ON documents (application_id);
