from __future__ import annotations

import importlib
import pkgutil
from collections.abc import Callable

from fastmcp import FastMCP

from ..app import App

Registrar = Callable[[FastMCP, App], None]


def registrars() -> list[tuple[str, Registrar]]:
    found: list[tuple[str, Registrar]] = []
    for info in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        module = importlib.import_module(f"{__name__}.{info.name}")
        register = getattr(module, "register", None)
        if callable(register):
            found.append((info.name, register))
    return found
