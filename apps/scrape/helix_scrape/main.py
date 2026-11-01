"""helix-scrape: the HTTP surface. /fetch keeps the Rust fetch service's contract; /render is
the browser tier."""

from __future__ import annotations

from fastapi import FastAPI

from helix_scrape import __version__
from helix_scrape.fetcher import fetch
from helix_scrape.models import FetchRequest, FetchResponse, Health, RenderRequest, RenderResponse
from helix_scrape.profiles import available
from helix_scrape.render import render
from helix_scrape.service_auth import require_service_token

app = FastAPI(title="helix-scrape", version=__version__)
app.middleware("http")(require_service_token)


@app.get("/health")
async def health() -> Health:
    return Health(status="ok", version=__version__, profiles_loaded=len(available()))


# A failed fetch is still HTTP 200 with success=false: the caller routes on the reason.
@app.post("/fetch")
async def fetch_route(req: FetchRequest) -> FetchResponse:
    return await fetch(req)


# Same rule: a page that did not render is HTTP 200 with success=false.
@app.post("/render")
async def render_route(req: RenderRequest) -> RenderResponse:
    return await render(req)
