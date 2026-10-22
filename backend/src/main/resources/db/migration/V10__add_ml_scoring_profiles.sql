CREATE TABLE ml_scoring_profiles (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL UNIQUE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_ml_scoring_profiles_application FOREIGN KEY (application_id) REFERENCES loan_applications(id)
);

CREATE INDEX idx_ml_scoring_profiles_application_id ON ml_scoring_profiles(application_id);
