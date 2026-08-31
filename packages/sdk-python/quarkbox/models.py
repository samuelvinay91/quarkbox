from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime

class Sandbox(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str
    runtime: str = "docker"
    image: str = "ubuntu:22.04"
    container_id: Optional[str] = Field(None, alias="containerId")
    container_ip: Optional[str] = Field(None, alias="containerIp")
    cpu_limit: int = Field(1, alias="cpuLimit")
    memory_limit: str = Field("512m", alias="memoryLimit")
    ports: Dict[str, str] = Field(default_factory=dict)
    env_vars: Dict[str, str] = Field(default_factory=dict, alias="envVars")
    labels: Dict[str, str] = Field(default_factory=dict)
    created_at: Optional[str] = Field(None, alias="createdAt")
    updated_at: Optional[str] = Field(None, alias="updatedAt")
    last_active_at: Optional[str] = Field(None, alias="lastActiveAt")

    class Config:
        populate_by_name = True

class ExecResult(BaseModel):
    exit_code: int = Field(..., alias="exitCode")
    stdout: str
    stderr: str

    @property
    def success(self) -> bool:
        return self.exit_code == 0

class Snapshot(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str
    sandbox_id: Optional[str] = Field(None, alias="sandboxId")
    snapshot_image: str = Field(..., alias="snapshotImage")
    size_bytes: int = Field(0, alias="sizeBytes")
    created_at: Optional[str] = Field(None, alias="createdAt")

    class Config:
        populate_by_name = True

class SandboxTemplate(BaseModel):
    id: str
    name: str
    category: str
    description: str
    icon: str
    image: str
    default_cpu: int = Field(1, alias="defaultCpu")
    default_memory: str = Field("512m", alias="defaultMemory")
    default_ports: Dict[str, str] = Field(default_factory=dict, alias="defaultPorts")
    tags: List[str] = Field(default_factory=list)

    class Config:
        populate_by_name = True
