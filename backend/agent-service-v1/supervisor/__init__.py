"""Sous Chef supervisor — deterministic orchestration layer."""

__all__ = ["run_supervisor_turn"]


def run_supervisor_turn(*args, **kwargs):
    from supervisor.graph import run_supervisor_turn as _run

    return _run(*args, **kwargs)
