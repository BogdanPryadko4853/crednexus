from dataclasses import dataclass
import os

from sqlalchemy.engine import URL


def database_url_from_env():
    if "DATABASE_URL" in os.environ:
        return os.environ["DATABASE_URL"]
    return URL.create(
        "postgresql+asyncpg", username=os.environ["PGUSER"], password=os.environ["PGPASSWORD"],
        host=os.environ.get("PGHOST", "127.0.0.1"), port=int(os.environ.get("PGPORT", "5432")),
        database=os.environ["PGDATABASE"],
    ).render_as_string(hide_password=False)


@dataclass(frozen=True)
class Settings:
    database_url: str
    api_key: str
    job_lease_seconds: int = 120
    poll_seconds: float = 1.
    max_attempts: int = 3

    def __post_init__(self):
        if not self.database_url.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use postgresql+asyncpg://")
        if len(self.api_key) < 16:
            raise ValueError("CREDNEXUS_BACKEND_API_KEY must contain at least 16 characters")
        if self.job_lease_seconds < 10 or self.poll_seconds <= 0 or not 1 <= self.max_attempts <= 10:
            raise ValueError("Invalid worker settings")

    @classmethod
    def from_env(cls):
        return cls(
            database_url=database_url_from_env(), api_key=os.environ["CREDNEXUS_BACKEND_API_KEY"],
            job_lease_seconds=int(os.environ.get("CREDNEXUS_JOB_LEASE_SECONDS", "120")),
            poll_seconds=float(os.environ.get("CREDNEXUS_POLL_SECONDS", "1")),
        )
