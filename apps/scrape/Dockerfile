# helix-scrape — fetching (plain and TLS-impersonating) for the API.
# The browser rung (Phase 2) adds a Chromium install here.

FROM python:3.12-slim AS runtime
WORKDIR /app

COPY pyproject.toml ./
COPY helix_scrape ./helix_scrape

RUN pip install --no-cache-dir .

ENV PYTHONUNBUFFERED=1
EXPOSE 7403

RUN useradd --create-home --shell /bin/bash helix && chown -R helix:helix /app
USER helix

CMD ["python", "-m", "helix_scrape", "--host", "0.0.0.0", "--port", "7403"]
