"""
QuarkBox Python SDK — AI Agent Example
=======================================
Demonstrates automated sandbox lifecycle, command execution,
file I/O, Git cloning, and stateful forking.
"""

from quarkbox import QuarkBox

def main():
    print("🚀 Initializing QuarkBox Python client...")
    qb = QuarkBox(api_url="http://localhost:3000/api")

    # 1. List available templates
    print("\n📦 Available Starter Templates:")
    templates = qb.list_templates()
    for tpl in templates:
        print(f"  {tpl.icon} {tpl.name} ({tpl.image}) — {tpl.default_cpu} vCPU / {tpl.default_memory}")

    # 2. Create an isolated sandbox
    print("\n⚡ Creating isolated Python AI sandbox (using warm pool if ready)...")
    sandbox = qb.sandboxes.create(
        name="ai-code-interpreter",
        image="python:3.12-slim",
        description="Autonomous AI Agent execution environment",
        cpu_limit=2,
        memory_limit="1g",
    )
    print(f"✅ Sandbox created! ID: {sandbox.id}, Status: {sandbox.status}")

    # 3. Write a Python script inside sandbox
    code = """
import sys
import math

print(f"Python version: {sys.version}")
print(f"Calculated Pi: {math.pi}")
print("Agent computation finished successfully!")
"""
    print("\n📝 Writing script to /workspace/agent_task.py inside sandbox...")
    sandbox.write_file("/workspace/agent_task.py", code)

    # 4. Execute script
    print("⚡ Executing script inside sandbox...")
    res = sandbox.exec("python3 /workspace/agent_task.py")
    print(f"Exit code: {res.exit_code}")
    print(f"Output:\n{res.stdout}")

    # 5. Stateful Snapshot & Forking
    print("📸 Creating snapshot checkpoint...")
    snapshot = sandbox.snapshot(name="checkpoint-step-1")
    print(f"Snapshot created: {snapshot.name} ({snapshot.snapshot_image})")

    # 6. Clean up
    print("🧹 Stopping and deleting sandbox...")
    sandbox.stop()
    sandbox.delete()
    print("✨ Demo completed successfully!")

if __name__ == "__main__":
    main()
