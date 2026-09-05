# Run (stdio):  docker run --rm -i -e CANVAS_URL -e CANVAS_TOKEN canvaslms-api
# Run (http):   docker run --rm -p 7100:7100 -e CANVAS_URL -e CANVAS_TOKEN canvaslms-api --transport http --host 0.0.0.0 --port 7100
FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src/ ./src/

RUN uv pip install --system --no-cache .

RUN useradd --create-home --shell /usr/sbin/nologin appuser
USER appuser

ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["canvaslms-api"]
