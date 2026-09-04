"""The one place every provider call goes through.

`llm.py` and `schema_gen.py` both talk to the same three native adapters
(OpenAI, Anthropic, Gemini) plus the OpenAI-wire fallback, and until now each
built its own request, called the SDK, and translated the failure inline —
so a transient 500 failed the call outright, with no shared retry and no
shared place to add spend tracking later.

`call_structured` is that chokepoint. Callers hand it an already-resolved
provider/model/credentials and an async thunk that performs the one wire call;
this function retries the retryable, classifies whatever the SDK throws into
one `ProviderError` shape, and is where cost/usage tracking or a provider
fallback chain would be added once, rather than in every call site.

This does not decide which vendor to call — `llm._resolve` still owns that —
only what happens around the call once a vendor has been chosen.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

T = TypeVar("T")

# Attempts include the first try, so 3 means up to 2 retries.
MAX_ATTEMPTS = 3
BASE_DELAY_SECONDS = 0.5
MAX_DELAY_SECONDS = 4.0


class ProviderError(RuntimeError):
    """A provider call failed, or none was configured."""


class RequestError(ValueError):
    """The request itself is incomplete; `field` names what to send."""

    def __init__(self, message: str, field: str) -> None:
        super().__init__(message)
        self.message = message
        self.field = field


def _status_of(exc: Exception) -> int | None:
    return getattr(exc, "status_code", None) or getattr(exc, "status", None)


# 429 (rate limit), 5xx (provider-side fault) and a connection failure carry no
# information about the request itself, so retrying them can plausibly help.
# Everything else — a bad key, a malformed request, a model that does not
# exist — will fail identically on the second attempt, and retrying it only
# delays the failure the caller needs to see.
def _is_retryable(exc: Exception) -> bool:
    status = _status_of(exc)
    if status == 429 or (status is not None and status >= 500):
        return True
    return getattr(exc, "__cause__", None) is not None and status is None and _looks_like_network_error(exc)


def _looks_like_network_error(exc: Exception) -> bool:
    name = exc.__class__.__name__
    return "Connection" in name or "Timeout" in name


def describe_failure(provider: str, model: str, exc: Exception) -> str:
    """One line the caller can act on. SDK messages carry status and reason; never key material."""
    status = _status_of(exc)
    detail = str(exc).strip() or exc.__class__.__name__
    prefix = f"{provider} ({model})"
    if status is not None:
        return f"{prefix} returned HTTP {status}: {detail}"[:500]
    return f"{prefix}: {detail}"[:500]


@dataclass
class CallOutcome:
    data: dict[str, Any]
    tokens_input: int
    tokens_output: int
    model_used: str
    attempts: int


async def call_structured(
    provider: str,
    model: str,
    call: Callable[[], Awaitable[tuple[dict[str, Any], int, int, str]]],
) -> CallOutcome:
    """Run one structured-output call through retry and error translation.

    `call` performs the actual SDK request and returns `(data, tokens_input,
    tokens_output, model_used)` — the vendor-specific request building stays
    with the caller, since that is what genuinely differs between OpenAI,
    Anthropic and Gemini. `ProviderError` and `SchemaError` (schema_compiler's,
    raised before any network call) pass through unretried and untouched;
    anything else is retried up to `MAX_ATTEMPTS` on a retryable status and
    re-raised as a `ProviderError` naming the provider and model.
    """
    last_exc: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            data, tokens_in, tokens_out, model_used = await call()
            return CallOutcome(
                data=data, tokens_input=tokens_in, tokens_output=tokens_out, model_used=model_used, attempts=attempt
            )
        except (ProviderError, RequestError):
            raise
        except Exception as exc:  # noqa: BLE001 - every SDK has its own exception tree
            last_exc = exc
            if attempt >= MAX_ATTEMPTS or not _is_retryable(exc):
                raise ProviderError(describe_failure(provider, model, exc)) from exc
            # Full jitter: spreads retries from concurrent callers instead of
            # having them all wake up and hit the same rate limit together.
            delay = min(MAX_DELAY_SECONDS, BASE_DELAY_SECONDS * (2 ** (attempt - 1)))
            await asyncio.sleep(random.uniform(0, delay))

    # Unreachable: the loop always returns or raises. Kept for type-checkers
    # that cannot see that MAX_ATTEMPTS >= 1 makes the loop non-empty.
    assert last_exc is not None
    raise ProviderError(describe_failure(provider, model, last_exc)) from last_exc


__all__ = ["CallOutcome", "ProviderError", "RequestError", "call_structured", "describe_failure"]
