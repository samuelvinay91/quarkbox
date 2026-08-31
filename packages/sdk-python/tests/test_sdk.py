import unittest
from quarkbox.models import Sandbox, ExecResult, Snapshot, SandboxTemplate
from quarkbox.client import QuarkBox, SandboxHandle

class TestQuarkBoxModels(unittest.TestCase):
    def test_sandbox_model_serialization(self):
        data = {
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "name": "test-box",
            "status": "running",
            "runtime": "docker",
            "image": "python:3.12-slim",
            "cpuLimit": 2,
            "memoryLimit": "1g",
            "containerIp": "10.0.0.5",
        }
        sb = Sandbox(**data)
        self.assertEqual(sb.id, data["id"])
        self.assertEqual(sb.name, "test-box")
        self.assertEqual(sb.cpu_limit, 2)
        self.assertEqual(sb.memory_limit, "1g")
        self.assertEqual(sb.container_ip, "10.0.0.5")

    def test_exec_result_model(self):
        res = ExecResult(exitCode=0, stdout="hello world\n", stderr="")
        self.assertTrue(res.success)
        self.assertEqual(res.stdout, "hello world\n")

        res_err = ExecResult(exitCode=1, stdout="", stderr="command not found")
        self.assertFalse(res_err.success)

    def test_template_model(self):
        tpl = SandboxTemplate(
            id="python-ai",
            name="Python AI",
            category="AI",
            description="PyTorch environment",
            icon="🐍",
            image="python:3.12-slim",
            defaultCpu=2,
            defaultMemory="2g",
            defaultPorts={"8888": "8888"},
            tags=["ml", "python"],
        )
        self.assertEqual(tpl.default_cpu, 2)
        self.assertEqual(tpl.default_memory, "2g")
        self.assertIn("ml", tpl.tags)

    def test_snapshot_model(self):
        snap = Snapshot(
            id="snap-123",
            name="checkpoint-1",
            status="ready",
            snapshotImage="quarkbox-snap-test:latest",
            sizeBytes=10485760,
        )
        self.assertEqual(snap.size_bytes, 10485760)
        self.assertEqual(snap.status, "ready")

if __name__ == "__main__":
    unittest.main()
