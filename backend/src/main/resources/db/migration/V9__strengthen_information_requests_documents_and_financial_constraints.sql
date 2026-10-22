ALTER TABLE information_requests
    ADD COLUMN verification_type VARCHAR(50),
    ADD COLUMN requirement_code VARCHAR(100),
    ADD COLUMN requires_document BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX uk_information_requests_open_requirement
    ON information_requests (application_id, verification_type, requirement_code)
    WHERE status = 'OPEN' AND verification_type IS NOT NULL AND requirement_code IS NOT NULL;

CREATE INDEX idx_information_requests_application_status
    ON information_requests (application_id, status);

ALTER TABLE financial_snapshots
    ADD CONSTRAINT chk_financial_snapshots_non_negative
    CHECK (
        annual_revenue >= 0
        AND annual_expenses >= 0
        AND existing_debt >= 0
        AND monthly_payments >= 0
        AND employee_count >= 0
    );

ALTER TABLE credit_products
    ADD CONSTRAINT chk_credit_products_limits
    CHECK (
        min_amount >= 0
        AND max_amount >= min_amount
        AND min_term_months > 0
        AND max_term_months >= min_term_months
        AND base_rate > 0
    );

ALTER TABLE credit_offers
    ADD CONSTRAINT chk_credit_offers_terms
    CHECK (amount >= 0 AND term_months > 0 AND interest_rate > 0);
