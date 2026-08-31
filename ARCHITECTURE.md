# QuarkBox Architecture

QuarkBox is a multi-tenant, enterprise-grade AI agent sandbox execution platform. It provides isolated, ephemeral runtime environments (Docker/Firecracker) with strict network controls, contextual injection (Git, Secrets), and deep telemetry.

## System Overview

```mermaid
graph TD
    Client[Client / SDK / MCP Server] -->|JWT Auth| API[QuarkBox API Gateway]
    
    subgraph "Core Orchestration"
        API --> AuthGuard[IAM & Auth Guard]
        AuthGuard --> Gov[Governor Service]
        Gov --> Context[Context Service: Git & Secrets]
        Gov --> SandboxSvc[Sandbox Service]
        Gov --> Pool[Warm Container Pool]
    end

    subgraph "Compliance & Auditing"
        SandboxSvc -.->|SIEM Logs| ActivitySvc[Activity Service]
        ActivitySvc -->|Append Only| AuditLog[(/tmp/quarkbox-audit.ndjson)]
    end

    subgraph "Runtime Providers"
        SandboxSvc --> RuntimeProvider{Runtime Interface}
        RuntimeProvider -->|Implementation| Docker[Docker Provider]
        RuntimeProvider -->|Implementation| Firecracker[Firecracker Provider]
        RuntimeProvider -->|Implementation| Containerd[Containerd Provider]
    end

    subgraph "Execution Environments"
        Docker --> C1[Agent Sandbox 1]
        Docker --> C2[Agent Sandbox 2]
        Firecracker --> M1[MicroVM Sandbox 1]
    end

    Context -.->|Clone & Inject| C1
    Context -.->|Mount| M1
```

## Software-Defined Cluster Mesh

QuarkBox supports linking multiple sandboxes into an isolated cluster mesh for multi-agent workflows or full-stack application testing.

```mermaid
graph LR
    API --> ClusterCtrl[Cluster Controller]
    ClusterCtrl --> DockerNetwork[Private Docker Network]

    subgraph "Software-Defined Network"
        DockerNetwork -.-> Frontend[Frontend Sandbox]
        DockerNetwork -.-> Backend[Backend Sandbox]
        DockerNetwork -.-> DB[Database Sandbox]
        
        Frontend <-->|http://backend| Backend
        Backend <-->|tcp://db:5432| DB
    end
```

## Security & Network Isolation

Every sandbox is explicitly hardened against SSRF and cloud metadata exfiltration.

```mermaid
sequenceDiagram
    participant Agent as AI Agent (Inside Sandbox)
    participant Sinkhole as DNS Sinkhole (ExtraHosts)
    participant Host as Cloud Provider Metadata (169.254.x.x)

    Agent->>Sinkhole: curl http://169.254.169.254/latest/meta-data/
    Note over Sinkhole: Traps request to 0.0.0.0
    Sinkhole-->>Agent: Connection Refused
    Agent->>Host: (Traffic Never Leaves Container)
```
