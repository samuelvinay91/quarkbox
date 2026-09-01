# @samuelvinay91/quarkbox-sdk

TypeScript SDK for the QuarkBox cloud sandbox platform.

## Install

```bash
npm install @samuelvinay91/quarkbox-sdk
```

## Quick Start

```typescript
import { QuarkBox } from '@samuelvinay91/quarkbox-sdk';

const qb = new QuarkBox({
  apiUrl: 'https://api.quarkbox.dev/api',
  apiKey: 'qb_your_api_key',
});

const sandbox = await qb.sandboxes.create({ name: 'my-env', image: 'python:3.12-slim' });
const result = await sandbox.exec('echo hello');
console.log(result.stdout);
await sandbox.stop();
await sandbox.remove();
```

## TLS Requirement

The SDK enforces HTTPS for all non-localhost URLs. Passing an `http://` URL that is not `http://localhost` or `http://127.0.0.1` throws a `QuarkBoxError` at construction time.

```typescript
// Valid — local development
new QuarkBox({ apiUrl: 'http://localhost:3000/api' });

// Valid — production
new QuarkBox({ apiUrl: 'https://api.quarkbox.dev/api' });

// Throws QuarkBoxError
new QuarkBox({ apiUrl: 'http://example.com/api' });
```

## Input Validation

`SandboxManager.create()` validates options before sending:

| Field | Rule |
|-------|------|
| `name` | Non-empty string, max 100 characters |
| `cpuLimit` | Positive integer |
| `memoryLimit` | Matches `/^\d+[mMgG]$/i` (e.g. `"512m"`, `"2g"`) |
| `ports.*` | Values must be numeric strings |
| `envVars.*` keys | Must not contain `=` or whitespace |

`SandboxManager.get(id)` and `SandboxManager.remove(id)` require a valid UUID. Non-UUID strings throw immediately.

## Error Handling

All SDK errors are instances of `QuarkBoxError` with an optional `status` code.

```typescript
import { QuarkBox, QuarkBoxError } from '@samuelvinay91/quarkbox-sdk';

try {
  const qb = new QuarkBox({ apiUrl: 'https://api.quarkbox.dev/api' });
  const sandbox = await qb.sandboxes.get('not-a-uuid');
} catch (err) {
  if (err instanceof QuarkBoxError) {
    console.error(`QuarkBox error (status ${err.status}): ${err.message}`);
  }
}
```

| Scenario | `status` | Example message |
|----------|----------|-----------------|
| HTTP 4xx/5xx | server status | `HTTP 404: Not Found` |
| Request timeout | `undefined` | `Request to /sandboxes timed out after 30000ms` |
| Network error (after retries) | `undefined` | Original error message |
| Invalid ID | `undefined` | `Invalid ID: expected a UUID, got "bad"` |
| Invalid option | `undefined` | `Invalid option: name must be a non-empty string...` |
| Non-HTTPS URL | `undefined` | `Invalid API URL: must use https:// in production` |

## Retry Behavior

GET and HEAD requests automatically retry up to **2 times** on network errors or aborts, with exponential backoff (250 ms × attempt). POST, PUT, and DELETE requests do **not** retry — they fail immediately on the first network error.

## URL Encoding

All dynamic path segments (sandbox IDs) are encoded with `encodeURIComponent()` before being interpolated into request URLs, preventing path traversal and malformed-URL issues.
