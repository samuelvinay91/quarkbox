// Plain Node test using the built-in test runner (node:test / node:assert).
//
// The SDK package compiles with `moduleResolution: "node"` (node10), under
// which TypeScript skips `node:`-prefixed module specifiers as absolute URIs
// and @types/node is not in scope. To stay build-compatible we load the
// built-in modules through a variable specifier (not a static literal import)
// and type the local surface below. Run after building the SDK:
//
//   npm run build --workspace=packages/sdk
//   node --test packages/sdk/dist/index.test.js

interface TestApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: (t?: { [key: string]: unknown }) => void): void;
}

interface AssertApi {
  ok(value: unknown, message?: string): void;
  equal(actual: unknown, expected: unknown, message?: string): void;
  doesNotThrow(fn: () => unknown, message?: string): void;
  throws(fn: () => unknown, expected?: unknown, message?: string): void;
}

async function loadNodeTestApi(): Promise<{
  describe: TestApi['describe'];
  it: TestApi['it'];
  assert: AssertApi;
}> {
  const testSpec = 'node:test';
  const assertSpec = 'node:assert/strict';
  const testModule: TestApi = (await import(testSpec)) as TestApi;
  const assertModule = (await import(assertSpec)) as {
    default: AssertApi;
  };
  return {
    describe: testModule.describe,
    it: testModule.it,
    assert: assertModule.default,
  };
}

import { QuarkBox, QuarkBoxError, assertValidId } from './index.js';

void (async () => {
  const { describe, it, assert } = await loadNodeTestApi();

  describe('assertValidId', () => {
    it('accepts a valid UUID', () => {
      assert.doesNotThrow(() =>
        assertValidId('550e8400-e29b-41d4-a716-446655440000'),
      );
    });

    it('accepts uppercase UUIDs', () => {
      assert.doesNotThrow(() =>
        assertValidId('550E8400-E29B-41D4-A716-446655440000'),
      );
    });

    it('rejects a non-UUID string', () => {
      assert.throws(
        () => assertValidId('not-a-uuid'),
        (err: unknown) =>
          err instanceof QuarkBoxError &&
          /expected a UUID/.test(err.message),
      );
    });

    it('rejects an empty string', () => {
      assert.throws(
        () => assertValidId(''),
        (err: unknown) => err instanceof QuarkBoxError,
      );
    });

    it('rejects a UUID missing a segment', () => {
      assert.throws(
        () => assertValidId('550e8400-e29b-41d4-a716'),
        (err: unknown) => err instanceof QuarkBoxError,
      );
    });

    it('rejects a UUID with invalid hex chars', () => {
      assert.throws(
        () => assertValidId('550e8400-e29b-41d4-a716-zzzzzzzzzzzz'),
        (err: unknown) => err instanceof QuarkBoxError,
      );
    });
  });

  describe('QuarkBox constructor', () => {
    it('rejects http:// non-localhost URLs', () => {
      assert.throws(
        () => new QuarkBox({ apiUrl: 'http://example.com/api' }),
        (err: unknown) =>
          err instanceof QuarkBoxError &&
          /must use https/.test(err.message),
      );
    });

    it('rejects http://127.0.0.2 (non-loopback)', () => {
      assert.throws(
        () => new QuarkBox({ apiUrl: 'http://127.0.0.2:3000/api' }),
        (err: unknown) =>
          err instanceof QuarkBoxError &&
          /must use https/.test(err.message),
      );
    });

    it('accepts https:// URLs', () => {
      assert.doesNotThrow(() =>
        new QuarkBox({ apiUrl: 'https://api.quarkbox.dev/api' }),
      );
    });

    it('accepts http://localhost', () => {
      assert.doesNotThrow(() =>
        new QuarkBox({ apiUrl: 'http://localhost:3000/api' }),
      );
    });

    it('accepts http://127.0.0.1', () => {
      assert.doesNotThrow(() =>
        new QuarkBox({ apiUrl: 'http://127.0.0.1:3000/api' }),
      );
    });
  });

  describe('URL encoding of sandbox IDs', () => {
    it('encodes special characters in a sandbox ID path', () => {
      const id = '../admin/secret';
      const encoded = encodeURIComponent(id);
      assert.equal(encoded, '..%2Fadmin%2Fsecret');
      assert.ok(!encoded.includes('/'));
    });

    it('encodes a normal UUID identically (no-op)', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      assert.equal(encodeURIComponent(id), id);
    });
  });
})();
