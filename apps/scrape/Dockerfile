# helix-scrape — fetching (plain and TLS-impersonating) and the browser rung (/render).

FROM python:3.12-slim AS runtime
WORKDIR /app

COPY pyproject.toml ./
COPY helix_scrape ./helix_scrape

RUN pip install --no-cache-dir .

# The browser rung drives Scrapling's patched Chromium (patchright). Install the Chromium
# build patchright expects, with its system libraries, where chromium_path() looks for it
# (PLAYWRIGHT_BROWSERS_PATH/chromium-<rev>). No headless shell: /render launches the full
# build. A shared folder, not root's home, so the unprivileged user below can run it.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN python -m patchright install --with-deps --no-shell chromium \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1
EXPOSE 7403

RUN useradd --create-home --shell /bin/bash helix && chown -R helix:helix /app
USER helix

CMD ["python", "-m", "helix_scrape", "--host", "0.0.0.0", "--port", "7403"]
