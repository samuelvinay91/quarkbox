import httpx
from typing import Optional, List, Dict, Any
from .models import Sandbox, ExecResult, Snapshot, SandboxTemplate

class QuarkBoxError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class SandboxHandle:
    """Handle for fluent interactions with a specific sandbox instance."""

    def __init__(self, client: "QuarkBox", sandbox: Sandbox):
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

    def refresh(self) -> Sandbox:
        """Refresh sandbox metadata from server."""
        self.data = self._client.sandboxes.get(self.id).data
        return self.data

    def exec(self, command: str, workdir: Optional[str] = None) -> ExecResult:
        """Execute a shell command inside the sandbox."""
        return self._client.sandboxes.exec(self.id, command, workdir)

    def read_file(self, path: str) -> str:
        """Read content of a file inside the sandbox."""
        res = self.exec(f'cat "{path}"')
        if not res.success:
            raise QuarkBoxError(f"Failed to read {path}: {res.stderr}")
        return res.stdout

    def write_file(self, path: str, content: str) -> None:
        """Write content to a file inside the sandbox."""
        escaped = content.replace("'", "'\\''")
        res = self.exec(f'mkdir -p "$(dirname "{path}")" && printf \'%s\' \'{escaped}\' > "{path}"')
        if not res.success:
            raise QuarkBoxError(f"Failed to write {path}: {res.stderr}")

    def inject_git(self, repo_url: str, branch: Optional[str] = None, target_dir: str = "/workspace") -> None:
        """Clone a Git repository into the sandbox."""
        self._client._post(f"/context/sandbox/{self.id}/git", {
            "repoUrl": repo_url,
            "branch": branch,
            "targetDir": target_dir,
        })

    def snapshot(self, name: str, description: Optional[str] = None) -> Snapshot:
        """Create a stateful filesystem snapshot of the sandbox."""
        res = self._client._post(f"/snapshots/sandbox/{self.id}", {
            "name": name,
            "description": description,
        })
        return Snapshot(**res)

    def fork(self, fork_name: str) -> Snapshot:
        """1-Click Fork: Clone current sandbox state into a new instance."""
        res = self._client._post(f"/snapshots/sandbox/{self.id}/fork", {
            "forkName": fork_name,
        })
        return Snapshot(**res)

    def start(self) -> Sandbox:
        return self._client.sandboxes.start(self.id)

    def stop(self) -> Sandbox:
        return self._client.sandboxes.stop(self.id)

    def pause(self) -> Sandbox:
        return self._client.sandboxes.pause(self.id)

    def resume(self) -> Sandbox:
        return self._client.sandboxes.resume(self.id)

    def delete(self) -> None:
        self._client.sandboxes.delete(self.id)


class SandboxManager:
    def __init__(self, client: "QuarkBox"):
        self._client = client

    def list(self) -> List[Sandbox]:
        res = self._client._get("/sandboxes")
        return [Sandbox(**item) for item in res]

    def get(self, sandbox_id: str) -> SandboxHandle:
        res = self._client._get(f"/sandboxes/{sandbox_id}")
        return SandboxHandle(self._client, Sandbox(**res))

    def create(
        self,
        name: str,
        image: str = "ubuntu:22.04",
        description: Optional[str] = None,
        cpu_limit: int = 1,
        memory_limit: str = "512m",
        ports: Optional[Dict[str, str]] = None,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> SandboxHandle:
        payload = {
            "name": name,
            "image": image,
            "description": description,
            "cpuLimit": cpu_limit,
            "memoryLimit": memory_limit,
            "ports": ports or {},
            "envVars": env_vars or {},
        }
        res = self._client._post("/sandboxes", payload)
        return SandboxHandle(self._client, Sandbox(**res))

    def create_from_repo(
        self,
        name: str,
        repo_url: str,
        branch: Optional[str] = None,
        image: Optional[str] = None,
        setup_script: Optional[str] = None,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> SandboxHandle:
        payload = {
            "name": name,
            "repoUrl": repo_url,
            "branch": branch,
            "image": image or "ubuntu:22.04",
            "setupScript": setup_script,
            "envVars": env_vars or {},
        }
        res = self._client._post("/context/create-from-repo", payload)
        return SandboxHandle(self._client, Sandbox(**res))

    def exec(self, sandbox_id: str, command: str, workdir: Optional[str] = None) -> ExecResult:
        res = self._client._post(f"/sandboxes/{sandbox_id}/exec", {
            "command": command,
            "workdir": workdir,
        })
        return ExecResult(**res)

    def start(self, sandbox_id: str) -> Sandbox:
        res = self._client._post(f"/sandboxes/{sandbox_id}/start")
        return Sandbox(**res)

    def stop(self, sandbox_id: str) -> Sandbox:
        res = self._client._post(f"/sandboxes/{sandbox_id}/stop")
        return Sandbox(**res)

    def pause(self, sandbox_id: str) -> Sandbox:
        res = self._client._post(f"/sandboxes/{sandbox_id}/pause")
        return Sandbox(**res)

    def resume(self, sandbox_id: str) -> Sandbox:
        res = self._client._post(f"/sandboxes/{sandbox_id}/resume")
        return Sandbox(**res)

    def delete(self, sandbox_id: str) -> None:
        self._client._delete(f"/sandboxes/{sandbox_id}")


class QuarkBox:
    """QuarkBox Client for interacting with the cloud sandbox platform."""

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

        self._http = httpx.Client(
            base_url=self.api_url,
            headers=headers,
            timeout=timeout,
        )
        self.sandboxes = SandboxManager(self)

    def _get(self, path: str) -> Any:
        res = self._http.get(path)
        self._check(res)
        return res.json()

    def _post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        res = self._http.post(path, json=json)
        self._check(res)
        if res.status_code == 204 or not res.content:
            return None
        return res.json()

    def _delete(self, path: str) -> None:
        res = self._http.delete(path)
        self._check(res)

    def _check(self, res: httpx.Response) -> None:
        if res.is_error:
            try:
                err = res.json().get("message", res.text)
            except Exception:
                err = res.text
            raise QuarkBoxError(f"API Error ({res.status_code}): {err}", res.status_code)

    def list_templates(self) -> List[SandboxTemplate]:
        res = self._get("/templates")
        return [SandboxTemplate(**item) for item in res]

    def close(self):
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
