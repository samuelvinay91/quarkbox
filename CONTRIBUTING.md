# Contributing to QuarkBox

Thank you for your interest in contributing to QuarkBox!

## Development Setup

1. **Prerequisites**: Node.js 24+, Docker Desktop, and npm.
2. **Install**: Run `npm install` in the root directory.
3. **Build**: Run `npm run build` to compile the monorepo packages.
4. **Run API**: `npm run start:api:dev` starts the NestJS API on port 3000.
5. **Run UI**: `npm run start:dashboard:dev` starts the Next.js dashboard on port 3001.

## Repository Structure
- `packages/api`: The core NestJS backend API orchestration layer.
- `packages/sdk`: The TypeScript Native Agent SDK.
- `packages/mcp-server`: The Model Context Protocol integration.
- `packages/dashboard`: The React/Next.js frontend.
- `deploy/helm`: Kubernetes deployment templates.

## Code Standards
- We use ESLint and Prettier. Ensure `npm run lint` passes before committing.
- Commit messages should follow conventional commits (e.g. `feat: add support for X`, `fix: resolve Y bug`).
- Include tests for all new core orchestration features.
