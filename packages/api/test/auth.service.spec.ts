import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from '../src/auth/auth.service';
import { UserService } from '../src/user/user.service';

describe('AuthService', () => {
  let authService: AuthService;
  const userService = {
    create: vi.fn(),
    validatePassword: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
  };
  const jwtService = {
    sign: vi.fn(),
    verify: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('generateToken', () => {
    it('signs a jwt with the provided payload', () => {
      jwtService.sign.mockReturnValue('signed-token');

      const token = authService.generateToken({ sub: 'u1', email: 'a@b.com' });

      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com' });
      expect(token).toBe('signed-token');
    });
  });

  describe('verifyToken', () => {
    it('verifies and returns payload', () => {
      jwtService.verify.mockReturnValue({ sub: 'u1', email: 'a@b.com' });

      const result = authService.verifyToken('some-token');

      expect(jwtService.verify).toHaveBeenCalledWith('some-token');
      expect(result).toEqual({ sub: 'u1', email: 'a@b.com' });
    });
  });

  describe('generateApiKey', () => {
    it('returns unprefixed raw key', () => {
      const { id, key } = authService.generateApiKey();
      expect(id).toBeDefined();
      expect(key.startsWith('qb_')).toBe(true);
      expect(key.length).toBeGreaterThan(10);
    });
  });

  describe('generateDevToken', () => {
    it('generates token for dev user', () => {
      jwtService.sign.mockReturnValue('dev-token');
      const token = authService.generateDevToken();
      const [payload] = jwtService.sign.mock.calls[0];
      expect(payload.sub).toBe('dev-user');
      expect(payload.email).toBe('dev@quarkbox.local');
      expect(token).toBe('dev-token');
    });
  });

  describe('register', () => {
    it('creates user and returns token with their id', async () => {
      const createdUser = { id: 'u1', email: 'a@b.com', name: 'Alice' };
      userService.create.mockResolvedValue(createdUser);
      jwtService.sign.mockReturnValue('token-1');

      const result = await authService.register('a@b.com', 'password123', 'Alice');

      expect(userService.create).toHaveBeenCalledWith('a@b.com', 'password123', 'Alice');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'a@b.com',
        name: 'Alice',
      });
      expect(result).toEqual({ user: createdUser, token: 'token-1' });
    });

    it('propagates errors from user creation (e.g. conflict)', async () => {
      userService.create.mockRejectedValue(new Error('Email already registered'));
      await expect(authService.register('a@b.com', 'password123')).rejects.toThrow(
        'Email already registered',
      );
    });
  });

  describe('login', () => {
    it('returns user and token on valid credentials', async () => {
      const user = { id: 'u1', email: 'a@b.com', name: 'Alice', isActive: true };
      userService.validatePassword.mockResolvedValue(user);
      jwtService.sign.mockReturnValue('token-1');

      const result = await authService.login('a@b.com', 'password123');

      expect(userService.validatePassword).toHaveBeenCalledWith('a@b.com', 'password123');
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com', name: 'Alice' });
      expect(result.token).toBe('token-1');
      expect(result.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'Alice' });
    });

    it('throws UnauthorizedException on invalid credentials', async () => {
      userService.validatePassword.mockResolvedValue(null);
      await expect(authService.login('a@b.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('does not emit a token when user is inactive', async () => {
      userService.validatePassword.mockResolvedValue(null);
      await expect(authService.login('a@b.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });
});
