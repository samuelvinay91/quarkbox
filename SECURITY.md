# Security Policy

## Supported Versions
Currently, only the `main` branch (v1.x.x) receives security updates.

## Reporting a Vulnerability
To report a vulnerability, please do NOT open a public GitHub issue. Instead, email security@quarkbox.io. We aim to respond to all reports within 48 hours.

## Enterprise Security Features

QuarkBox implements several critical enterprise security boundaries:

### 1. Cloud Metadata & SSRF Protection
All sandbox containers are deployed with hard-coded DNS sinkholes (via Docker `ExtraHosts`) to prevent Server-Side Request Forgery (SSRF) against cloud provider metadata services:
- `169.254.169.254` (AWS/GCP) -> `0.0.0.0`
- `metadata.google.internal` -> `0.0.0.0`
- `100.100.100.200` (Alibaba) -> `0.0.0.0`

### 2. IAM & Authentication
The QuarkBox API Gateway is strictly protected by a `JwtAuthGuard` globally. All client SDKs and programmatic tools must authenticate using a Bearer token. 

### 3. Shell Injection Protection
The Context Injection service rigorously sanitizes and single-quotes all user-supplied Git repository URLs and branch names, completely neutralizing bash variable expansion and subshell injection.

### 4. Immutable Audit Logs (SOC2 / HIPAA)
All critical state mutations and code executions are intercepted and pushed to a local append-only `.ndjson` log, ensuring compliance with SOC2 audit requirements for SIEM ingestion.
