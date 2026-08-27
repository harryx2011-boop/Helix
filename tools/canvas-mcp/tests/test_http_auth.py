from __future__ import annotations

import pytest
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from canvaslms_api.http_auth import SharedSecretGuard, is_loopback, secret_url

TOKEN = "s3cret-token-of-adequate-length"


@pytest.fixture
def client() -> TestClient:
    async def echo(request: Request) -> JSONResponse:
        return JSONResponse({"path": request.url.path, "root_path": request.scope["root_path"]})

    app = Starlette(
        routes=[Route("/mcp/", echo), Route("/", echo), Route("/redirected/", echo)],
        middleware=[Middleware(SharedSecretGuard, token=TOKEN)],
    )
    return TestClient(app)


def test_request_without_credentials_is_401(client: TestClient) -> None:
    response = client.get("/mcp/")
    assert response.status_code == 401
    assert "Bearer" in response.headers["www-authenticate"]


def test_bearer_token_is_accepted(client: TestClient) -> None:
    response = client.get("/mcp/", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    assert response.json()["path"] == "/mcp/"


def test_bearer_scheme_is_case_insensitive(client: TestClient) -> None:
    response = client.get("/mcp/", headers={"Authorization": f"bearer {TOKEN}"})
    assert response.status_code == 200


def test_wrong_bearer_token_is_401(client: TestClient) -> None:
    response = client.get("/mcp/", headers={"Authorization": "Bearer wrong-token-entirely"})
    assert response.status_code == 401


def test_secret_path_prefix_routes_below_the_prefix(client: TestClient) -> None:
    response = client.get(f"/s/{TOKEN}/mcp/")
    assert response.status_code == 200
    body = response.json()
    # The prefix stays in the path and is named as root_path, so the app
    # routes as if it were mounted there -- and keeps it when building URLs.
    assert body["path"] == f"/s/{TOKEN}/mcp/"
    assert body["root_path"] == f"/s/{TOKEN}"


def test_secret_path_prefix_without_trailing_path_hits_root(client: TestClient) -> None:
    response = client.get(f"/s/{TOKEN}")
    assert response.status_code == 200
    assert response.json()["root_path"] == f"/s/{TOKEN}"


def test_redirect_keeps_the_secret_prefix(client: TestClient) -> None:
    """A dropped prefix would bounce the client to an endpoint that 401s."""
    response = client.get(f"/s/{TOKEN}/redirected", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"].endswith(f"/s/{TOKEN}/redirected/")


def test_wrong_secret_path_prefix_is_401(client: TestClient) -> None:
    response = client.get("/s/not-the-token/mcp/")
    assert response.status_code == 401


def test_token_in_query_string_is_not_accepted(client: TestClient) -> None:
    response = client.get(f"/mcp/?token={TOKEN}")
    assert response.status_code == 401


def test_secret_url_builds_connector_url() -> None:
    assert secret_url("https://demo.trycloudflare.com/", TOKEN) == (
        f"https://demo.trycloudflare.com/s/{TOKEN}/mcp"
    )


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1", ""])
def test_is_loopback_true(host: str) -> None:
    assert is_loopback(host)


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.1.10", "example.com"])
def test_is_loopback_false(host: str) -> None:
    assert not is_loopback(host)
