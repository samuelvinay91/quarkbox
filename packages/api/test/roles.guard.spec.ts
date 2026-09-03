import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../src/auth/roles.guard';
import { ROLES_KEY } from '../src/auth/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user: any): ExecutionContext {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access if no roles metadata is set on handler or class', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ role: 'user' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access if roles array is empty', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createMockContext({ role: 'user' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects access if user is missing on request when role is required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext(null);

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows admin to access admin-required endpoint', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const context = createMockContext({ role: 'admin' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows admin to access operator or user-required endpoints due to hierarchy', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['operator']);
    expect(guard.canActivate(createMockContext({ role: 'admin' }))).toBe(true);

    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user']);
    expect(guard.canActivate(createMockContext({ role: 'admin' }))).toBe(true);
  });

  it('allows operator to access user or operator-required endpoints, but rejects admin', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['operator']);
    expect(guard.canActivate(createMockContext({ role: 'operator' }))).toBe(true);

    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user']);
    expect(guard.canActivate(createMockContext({ role: 'operator' }))).toBe(true);

    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(createMockContext({ role: 'operator' }))).toBe(false);
  });

  it('rejects regular user accessing operator or admin endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['operator']);
    expect(guard.canActivate(createMockContext({ role: 'user' }))).toBe(false);

    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(createMockContext({ role: 'user' }))).toBe(false);
  });

  it('allows user accessing user-required endpoint', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user']);
    expect(guard.canActivate(createMockContext({ role: 'user' }))).toBe(true);
  });

  it('rejects readonly user from mutating user or operator endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user']);
    expect(guard.canActivate(createMockContext({ role: 'readonly' }))).toBe(false);

    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['readonly']);
    expect(guard.canActivate(createMockContext({ role: 'readonly' }))).toBe(true);
  });
});
