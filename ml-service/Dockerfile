FROM python:3.15.0-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CREDNEXUS_DEVICE=auto \
    CREDNEXUS_MODEL_THREADS=4
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --create-home appuser

FROM base AS ml
COPY requirements-ml.lock ./
RUN pip install --no-cache-dir -r requirements-ml.lock
COPY crednexus_ml ./crednexus_ml
COPY models/onnx ./models/onnx
RUN CREDNEXUS_DEVICE=cpu python -m crednexus_ml.onnx_demo > /dev/null
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-m", "crednexus_ml.healthcheck"]
CMD ["python", "-m", "uvicorn", "crednexus_ml.api:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "20"]

FROM ml AS backend
USER root
COPY requirements-backend.lock ./
RUN pip install --no-cache-dir -r requirements-backend.lock
COPY crednexus_backend ./crednexus_backend
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini
USER appuser
CMD ["python", "-m", "uvicorn", "crednexus_backend.api:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "20"]
