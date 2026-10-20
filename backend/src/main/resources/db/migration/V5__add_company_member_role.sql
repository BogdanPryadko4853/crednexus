ALTER TABLE company_members
    ADD COLUMN member_role VARCHAR(50) NOT NULL DEFAULT 'REPRESENTATIVE';

ALTER TABLE company_members
    ADD CONSTRAINT chk_company_members_role CHECK (member_role IN ('OWNER', 'REPRESENTATIVE'));

ALTER TABLE company_members
    ALTER COLUMN member_role DROP DEFAULT;
