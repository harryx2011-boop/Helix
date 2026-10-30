"""The command line entry: the container healthcheck."""

from __future__ import annotations

import socket

import pytest

from helix_scrape.__main__ import _healthcheck, main


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def test_healthcheck_fails_when_nothing_listens() -> None:
    assert _healthcheck(_free_port()) == 1


def test_the_healthcheck_flag_exits_with_that_code() -> None:
    with pytest.raises(SystemExit) as exit_info:
        main(["--healthcheck", "--port", str(_free_port())])
    assert exit_info.value.code == 1
