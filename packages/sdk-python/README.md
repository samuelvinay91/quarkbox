# QuarkBox Python SDK

> **Python client for QuarkBox cloud sandbox platform — purpose-built for AI agents, code execution, and autonomous workflows.**

---

## Installation

```bash
pip install quarkbox
```

---

## Quick Start

```python
from quarkbox import QuarkBox

qb = QuarkBox(api_url="http://localhost:3000/api")

# Create a sandbox (spins up in <50ms with warm pool)
sandbox = qb.sandboxes.create(
    name="my-agent-sandbox",
    image="python:3.12-slim",
    cpu_limit=2,
    memory_limit="1g",
)

# Run code & commands
result = sandbox.exec("pip install requests && python -c 'import requests; print(requests.__version__)'")
print(result.stdout)

# File operations
sandbox.write_file("/workspace/hello.py", "print('Hello QuarkBox!')")
print(sandbox.read_file("/workspace/hello.py"))

# Snapshot / Checkpoint
snapshot = sandbox.snapshot(name="checkpoint-1")

# Clean up
sandbox.delete()
```

### Async Client for High Concurrency

```python
import asyncio
from quarkbox import AsyncQuarkBox

async def main():
    async with AsyncQuarkBox(api_url="http://localhost:3000/api") as qb:
        sandbox = await qb.sandboxes.create(name="async-task")
        res = await sandbox.exec("echo 'Parallel agent execution'")
        print(res.stdout)
        await sandbox.delete()

asyncio.run(main())
```
