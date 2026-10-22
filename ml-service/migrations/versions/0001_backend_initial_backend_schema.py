"""Initial backend schema"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001_backend'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('companies',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('credit_products',
    sa.Column('code', sa.String(length=60), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.PrimaryKeyConstraint('code')
    )
    op.create_table('company_profiles',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('company_id', sa.Uuid(), nullable=False),
    sa.Column('as_of_month', sa.Date(), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('content_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('company_id', 'content_hash', name='uq_profile_content')
    )
    op.create_index(op.f('ix_company_profiles_company_id'), 'company_profiles', ['company_id'], unique=False)
    op.create_table('credit_applications',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('company_id', sa.Uuid(), nullable=False),
    sa.Column('product_code', sa.String(length=60), nullable=False),
    sa.Column('profile_id', sa.Uuid(), nullable=True),
    sa.Column('parameters', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('latest_job_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('DRAFT','NEEDS_INFO','SUBMITTED','SCORING','APPROVED','COUNTER_OFFER','REJECTED','REVIEW_REQUIRED','FAILED')", name='ck_application_status'),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.ForeignKeyConstraint(['product_code'], ['credit_products.code'], ),
    sa.ForeignKeyConstraint(['profile_id'], ['company_profiles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_credit_applications_company_id'), 'credit_applications', ['company_id'], unique=False)
    op.create_table('application_events',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('sequence', sa.BigInteger(), sa.Identity(), nullable=False),
    sa.Column('application_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['application_id'], ['credit_applications.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('sequence')
    )
    op.create_index(op.f('ix_application_events_application_id'), 'application_events', ['application_id'], unique=False)
    op.create_table('ml_jobs',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('company_id', sa.Uuid(), nullable=False),
    sa.Column('application_id', sa.Uuid(), nullable=True),
    sa.Column('kind', sa.String(length=30), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('scope', sa.String(length=100), nullable=False),
    sa.Column('idempotency_key', sa.String(length=128), nullable=False),
    sa.Column('request_hash', sa.String(length=64), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('error_code', sa.String(length=60), nullable=True),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('max_attempts', sa.Integer(), nullable=False),
    sa.Column('lease_token', sa.Uuid(), nullable=True),
    sa.Column('lease_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('available_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("kind IN ('ASSESS_APPLICATION','FORECAST','CASH_GAP')", name='ck_job_kind'),
    sa.CheckConstraint("status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')", name='ck_job_status'),
    sa.CheckConstraint('attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts', name='ck_job_attempts'),
    sa.ForeignKeyConstraint(['application_id'], ['credit_applications.id'], ),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('scope', 'idempotency_key', name='uq_job_idempotency')
    )
    op.create_index('ix_job_claim', 'ml_jobs', ['status', 'available_at', 'created_at'], unique=False)
    op.create_index(op.f('ix_ml_jobs_company_id'), 'ml_jobs', ['company_id'], unique=False)
    op.create_foreign_key('fk_application_latest_job', 'credit_applications', 'ml_jobs', ['latest_job_id'], ['id'])
    op.create_table('credit_decisions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('application_id', sa.Uuid(), nullable=False),
    sa.Column('job_id', sa.Uuid(), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['application_id'], ['credit_applications.id'], ),
    sa.ForeignKeyConstraint(['job_id'], ['ml_jobs.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('job_id')
    )
    op.create_index(op.f('ix_credit_decisions_application_id'), 'credit_decisions', ['application_id'], unique=False)

    products = sa.table('credit_products', sa.column('code', sa.String()), sa.column('data', postgresql.JSONB()))
    op.bulk_insert(products, [{'code': 'working-capital', 'data': {'code': 'working-capital', 'name': 'Оборотный кредит — демонстрационный', 'annual_rate': 0.18, 'min_amount': 50000.0, 'max_amount': 3000000.0, 'min_term_months': 3, 'max_term_months': 36, 'purposes': ['working_capital'], 'minimum_business_age_months': 12, 'minimum_cash_flow_coverage': 1.2, 'review_probability': 0.1, 'reject_probability': 0.2, 'policy_version': 'demo-credit-v1'}}])


def downgrade():
    op.drop_constraint('fk_application_latest_job', 'credit_applications', type_='foreignkey')
    op.drop_index(op.f('ix_credit_decisions_application_id'), table_name='credit_decisions')
    op.drop_table('credit_decisions')
    op.drop_index(op.f('ix_ml_jobs_company_id'), table_name='ml_jobs')
    op.drop_index('ix_job_claim', table_name='ml_jobs')
    op.drop_table('ml_jobs')
    op.drop_index(op.f('ix_application_events_application_id'), table_name='application_events')
    op.drop_table('application_events')
    op.drop_index(op.f('ix_credit_applications_company_id'), table_name='credit_applications')
    op.drop_table('credit_applications')
    op.drop_index(op.f('ix_company_profiles_company_id'), table_name='company_profiles')
    op.drop_table('company_profiles')
    op.drop_table('credit_products')
    op.drop_table('companies')
