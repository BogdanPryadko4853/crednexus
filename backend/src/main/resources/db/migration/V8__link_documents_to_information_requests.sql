ALTER TABLE documents
    ADD COLUMN information_request_id UUID,
    ADD CONSTRAINT fk_documents_information_request
        FOREIGN KEY (information_request_id) REFERENCES information_requests (id);

CREATE INDEX idx_documents_information_request_id ON documents (information_request_id);
