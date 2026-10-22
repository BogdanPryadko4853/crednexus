ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN keycloak_id VARCHAR(255);

ALTER TABLE users
    ADD CONSTRAINT uk_users_keycloak_id UNIQUE (keycloak_id);
