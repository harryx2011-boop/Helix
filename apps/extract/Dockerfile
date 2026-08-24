# helix-extract — Python extraction and parsing.

FROM python:3.12-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY helix_extract ./helix_extract

RUN pip install --no-cache-dir -e .

# Pre-download the default local embedding model so first request is not a
# multi-hundred-megabyte stall. Cached to a volume in compose.
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')" || \
    echo "model pre-download skipped; will fetch on first use"

ENV PYTHONUNBUFFERED=1
EXPOSE 7402

RUN useradd --create-home --shell /bin/bash helix && chown -R helix:helix /app
USER helix

CMD ["uvicorn", "helix_extract.main:app", "--host", "0.0.0.0", "--port", "7402"]
