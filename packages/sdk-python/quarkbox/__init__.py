"""
QuarkBox Python SDK
===================

Programmatic access to isolated cloud development environments and AI agent execution sandboxes.

Quick start:
    from quarkbox import QuarkBox

    qb = QuarkBox(api_url="http://localhost:3000/api")
    sandbox = qb.sandboxes.create(name="agent-env", image="python:3.12-slim")
    result = sandbox.exec("python -c 'print(40 + 2)'")
    print(result.stdout) # "42\n"
    sandbox.delete()
"""

from .client import QuarkBox, SandboxHandle, SandboxManager, QuarkBoxError
from .async_client import AsyncQuarkBox, AsyncSandboxHandle, AsyncSandboxManager
from .models import Sandbox, ExecResult, Snapshot, SandboxTemplate

__version__ = "0.1.0"
__all__ = [
    "QuarkBox",
    "AsyncQuarkBox",
    "SandboxHandle",
    "AsyncSandboxHandle",
    "SandboxManager",
    "AsyncSandboxManager",
    "QuarkBoxError",
    "Sandbox",
    "ExecResult",
    "Snapshot",
    "SandboxTemplate",
]
