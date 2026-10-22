CREATE TABLE workflow_jobs (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    available_at TIMESTAMPTZ NOT NULL,
    locked_until TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    version INTEGER NOT NULL,
    CONSTRAINT fk_workflow_jobs_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
    CONSTRAINT chk_workflow_jobs_attempts CHECK (attempts >= 0 AND max_attempts > 0)
);

CREATE INDEX idx_workflow_jobs_ready ON workflow_jobs (status, available_at);
CREATE UNIQUE INDEX uk_workflow_jobs_active_verification
    ON workflow_jobs (application_id, job_type)
    WHERE status IN ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED');
