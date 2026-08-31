import httpx
from typing import Optional, List, Dict, Any
from .models import Sandbox, ExecResult, Snapshot, SandboxTemplate
from .client import QuarkBoxError

class AsyncSandboxHandle:
    """Async Handle for interacting with a specific sandbox instance."""

    def __init__(self, client: "AsyncQuarkBox", sandbox: Sandbox):
        self._client = client
        self.data = sandbox

    @property
    def id(self) -> str:
        return self.data.id

    @property
    def name(self) -> str:
        return self.data.name

    @property
    def status(self) -> str:
        return self.data.status

    async def refresh(self) -> Sandbox:
        handle = await self._client.sandboxes.get(self.id)
        self.data = handle.data
        return self.data

    async def exec(self, command: str, workdir: Optional[str] = None) -> ExecResult:
        return await self._client.sandboxes.exec(self.id, command, workdir)

    async def read_file(self, path: str) -> str:
        res = await self.exec(f'cat "{path}"')
        if not res.success:
            raise QuarkBoxError(f"Failed to read {path}: {res.stderr}")
        return res.stdout

    async def write_file(self, path: str, content: str) -> None:
        escaped = content.replace("'", "'\\''")
        res = await self.exec(f'mkdir -p "$(dirname "{path}")" && printf \'%s\' \'{escaped}\' > "{path}"')
        if not res.success:
            raise QuarkBoxError(f"Failed to write {path}: {res.stderr}")

    async def snapshot(self, name: str, description: Optional[str] = None) -> Snapshot:
        res = await self._client._post(f"/snapshots/sandbox/{self.id}", {
            "name": name,
            "description": description,
        })
        return Snapshot(**res)

    async def fork(self, fork_name: str) -> Snapshot:
        res = await self._client._post(f"/snapshots/sandbox/{self.id}/fork", {
            "forkName": fork_name,
        })
        return Snapshot(**res)

    async def start(self) -> Sandbox:
        return await self._client.sandboxes.start(self.id)

    async def stop(self) -> Sandbox:
        return await self._client.sandboxes.stop(self.id)

    async def pause(self) -> Sandbox:
        return await self._client.sandboxes.pause(self.id)

    async def resume(self) -> Sandbox:
        return await self._client.sandboxes.resume(self.id)

    async def delete(self) -> None:
        await self._client.sandboxes.delete(self.id)


class AsyncSandboxManager:
    def __init__(self, client: "AsyncQuarkBox"):
        self._client = client

    async def list(self) -> List[Sandbox]:
        res = await self._client._get("/sandboxes")
        return [Sandbox(**item) for item in res]

    async def get(self, sandbox_id: str) -> AsyncSandboxHandle:
        res = await self._client._get(f"/sandboxes/{sandbox_id}")
        return AsyncSandboxHandle(self._client, Sandbox(**res))

    async def create(
        self,
        name: str,
        image: str = "ubuntu:22.04",
        description: Optional[str] = None,
        cpu_limit: int = 1,
        memory_limit: str = "512m",
        ports: Optional[Dict[str, str]] = None,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> AsyncSandboxHandle:
        payload = {
            "name": name,
            "image": image,
            "description": description,
            "cpuLimit": cpu_limit,
            "memoryLimit": memory_limit,
            "ports": ports or {},
            "envVars": env_vars or {},
        }
        res = await self._client._post("/sandboxes", payload)
        return AsyncSandboxHandle(self._client, Sandbox(**res))

    async def exec(self, sandbox_id: str, command: str, workdir: Optional[str] = None) -> ExecResult:
        res = await self._client._post(f"/sandboxes/{sandbox_id}/exec", {
            "command": command,
            "workdir": workdir,
        })
        return ExecResult(**res)

    async def start(self, sandbox_id: str) -> Sandbox:
        res = await self._client._post(f"/sandboxes/{sandbox_id}/start")
        return Sandbox(**res)

    async def stop(self, sandbox_id: str) -> Sandbox:
        res = await self._client._post(f"/sandboxes/{sandbox_id}/stop")
        return Sandbox(**res)

    async def pause(self, sandbox_id: str) -> Sandbox:
        res = await self._client._post(f"/sandboxes/{sandbox_id}/pause")
        return Sandbox(**res)

    async def resume(self, sandbox_id: str) -> Sandbox:
        res = await self._client._post(f"/sandboxes/{sandbox_id}/resume")
        return Sandbox(**res)

    async def delete(self, sandbox_id: str) -> None:
        await self._client._delete(f"/sandboxes/{sandbox_id}")


class AsyncQuarkBox:
    """Asynchronous QuarkBox Client for high-concurrency AI agent systems."""

    def __init__(
        self,
        api_url: str = "http://localhost:3000/api",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self._http = httpx.AsyncClient(
            base_url=self.api_url,
            headers=headers,
            timeout=timeout,
        )
        self.sandboxes = AsyncSandboxManager(self)

    async def _get(self, path: str) -> Any:
        res = await self._http.get(path)
        self._check(res)
        return res.json()

    async def _post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        res = await self._http.post(path, json=json)
        self._check(res)
        if res.status_code == 204 or not res.content:
            return None
        return res.json()

    async def _delete(self, path: str) -> None:
        res = await self._http.delete(path)
        self._check(res)

    def _check(self, res: httpx.Response) -> None:
        if res.is_error:
            try:
                err = res.json().get("message", res.text)
            except Exception:
                err = res.text
            raise QuarkBoxError(f"API Error ({res.status_code}): {err}", res.status_code)

    async def close(self):
        await self._http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
