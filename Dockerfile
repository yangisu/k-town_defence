FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system ktown && adduser --system --ingroup ktown ktown

COPY pyproject.toml README.md alembic.ini ./
COPY alembic ./alembic
COPY src ./src
RUN pip install --no-cache-dir .

RUN mkdir -p /data/private-uploads && chown -R ktown:ktown /app /data
USER ktown

EXPOSE 8000
CMD ["uvicorn", "ktown_defense.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
