CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_users_email UNIQUE (email)
);

CREATE TABLE companies (
    id UUID PRIMARY KEY,
    inn VARCHAR(12) NOT NULL,
    ogrn_or_ogrnip VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    legal_form VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    CONSTRAINT uk_companies_inn UNIQUE (inn)
);

CREATE TABLE credit_products (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    min_amount NUMERIC(19, 2) NOT NULL,
    max_amount NUMERIC(19, 2) NOT NULL,
    min_term_months INTEGER NOT NULL,
    max_term_months INTEGER NOT NULL,
    base_rate NUMERIC(19, 2) NOT NULL,
    active BOOLEAN NOT NULL
);

CREATE TABLE company_members (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    company_id UUID NOT NULL,
    position VARCHAR(255) NOT NULL,
    can_apply BOOLEAN NOT NULL,
    active BOOLEAN NOT NULL,
    CONSTRAINT uk_company_members_user_company UNIQUE (user_id, company_id),
    CONSTRAINT fk_company_members_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_company_members_company FOREIGN KEY (company_id) REFERENCES companies (id)
);

CREATE TABLE loan_applications (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL,
    created_by UUID NOT NULL,
    product_id UUID NOT NULL,
    requested_amount NUMERIC(19, 2) NOT NULL,
    term_months INTEGER NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version INTEGER NOT NULL,
    CONSTRAINT fk_loan_applications_company FOREIGN KEY (company_id) REFERENCES companies (id),
    CONSTRAINT fk_loan_applications_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_loan_applications_product FOREIGN KEY (product_id) REFERENCES credit_products (id)
);

CREATE TABLE financial_snapshots (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    annual_revenue NUMERIC(19, 2) NOT NULL,
    annual_expenses NUMERIC(19, 2) NOT NULL,
    existing_debt NUMERIC(19, 2) NOT NULL,
    monthly_payments NUMERIC(19, 2) NOT NULL,
    employee_count INTEGER NOT NULL,
    period VARCHAR(255) NOT NULL,
    CONSTRAINT uk_financial_snapshots_application UNIQUE (application_id),
    CONSTRAINT fk_financial_snapshots_application FOREIGN KEY (application_id) REFERENCES loan_applications (id)
);

CREATE TABLE verification_results (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    source VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_verification_results_application FOREIGN KEY (application_id) REFERENCES loan_applications (id)
);

CREATE TABLE scoring_results (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    score INTEGER NOT NULL,
    risk_level VARCHAR(50) NOT NULL,
    factors JSONB NOT NULL,
    model_version VARCHAR(255) NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_scoring_results_score CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT fk_scoring_results_application FOREIGN KEY (application_id) REFERENCES loan_applications (id)
);

CREATE TABLE information_requests (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    question TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    requested_by UUID,
    answer TEXT,
    answered_at TIMESTAMPTZ,
    CONSTRAINT fk_information_requests_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
    CONSTRAINT fk_information_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users (id)
);

CREATE TABLE application_status_history (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    from_status VARCHAR(50) NOT NULL,
    to_status VARCHAR(50) NOT NULL,
    actor_id UUID,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_status_history_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
    CONSTRAINT fk_status_history_actor FOREIGN KEY (actor_id) REFERENCES users (id)
);

CREATE TABLE credit_decisions (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    decision_type VARCHAR(50) NOT NULL,
    reason TEXT,
    decided_by UUID,
    decided_at TIMESTAMPTZ NOT NULL,
    policy_version VARCHAR(255) NOT NULL,
    CONSTRAINT fk_credit_decisions_application FOREIGN KEY (application_id) REFERENCES loan_applications (id),
    CONSTRAINT fk_credit_decisions_decided_by FOREIGN KEY (decided_by) REFERENCES users (id)
);

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES loan_applications (id)
);

CREATE TABLE credit_offers (
    id UUID PRIMARY KEY,
    decision_id UUID NOT NULL,
    amount NUMERIC(19, 2) NOT NULL,
    term_months INTEGER NOT NULL,
    interest_rate NUMERIC(5, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_credit_offers_decision UNIQUE (decision_id),
    CONSTRAINT fk_credit_offers_decision FOREIGN KEY (decision_id) REFERENCES credit_decisions (id)
);

CREATE TABLE loan_agreements (
    id UUID PRIMARY KEY,
    offer_id UUID NOT NULL,
    contract_number VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    signed_at TIMESTAMPTZ,
    CONSTRAINT uk_loan_agreements_offer UNIQUE (offer_id),
    CONSTRAINT fk_loan_agreements_offer FOREIGN KEY (offer_id) REFERENCES credit_offers (id)
);

CREATE TABLE disbursements (
    id UUID PRIMARY KEY,
    agreement_id UUID NOT NULL,
    amount NUMERIC(19, 2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    executed_at TIMESTAMPTZ,
    CONSTRAINT uk_disbursements_agreement UNIQUE (agreement_id),
    CONSTRAINT fk_disbursements_agreement FOREIGN KEY (agreement_id) REFERENCES loan_agreements (id)
);

CREATE INDEX idx_company_members_user_id ON company_members (user_id);
CREATE INDEX idx_company_members_company_id ON company_members (company_id);
CREATE INDEX idx_loan_applications_company_id ON loan_applications (company_id);
CREATE INDEX idx_loan_applications_created_by ON loan_applications (created_by);
CREATE INDEX idx_loan_applications_product_id ON loan_applications (product_id);
CREATE INDEX idx_loan_applications_status ON loan_applications (status);
CREATE INDEX idx_verification_results_application_id ON verification_results (application_id);
CREATE INDEX idx_scoring_results_application_id ON scoring_results (application_id);
CREATE INDEX idx_information_requests_application_id ON information_requests (application_id);
CREATE INDEX idx_information_requests_requested_by ON information_requests (requested_by);
CREATE INDEX idx_status_history_application_id ON application_status_history (application_id);
CREATE INDEX idx_status_history_actor_id ON application_status_history (actor_id);
CREATE INDEX idx_credit_decisions_application_id ON credit_decisions (application_id);
CREATE INDEX idx_credit_decisions_decided_by ON credit_decisions (decided_by);
CREATE INDEX idx_documents_application_id ON documents (application_id);
