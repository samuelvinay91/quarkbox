import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { UserService } from '../src/user/user.service';
import { User } from '../src/user/user.entity';

const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('bcryptjs', () => bcryptMock);

const userRepo = {
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
};

describe('UserService', () => {
  let userService: UserService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    userService = module.get(UserService);
  });

  describe('create', () => {
    it('hashes the password and returns user without passwordHash', async () => {
      const saved: any = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hashed-value',
        name: 'Alice',
        isActive: true,
      };
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockImplementation((data: any) => data);
      userRepo.save.mockResolvedValue(saved);
      bcryptMock.hash.mockResolvedValue('$2b$12$hashedvaluehashvalue');

      const result = await userService.create('a@b.com', 'plain-password', 'Alice');

      expect(userRepo.create).toHaveBeenCalledWith({
        email: 'a@b.com',
        passwordHash: '$2b$12$hashedvaluehashvalue',
        name: 'Alice',
      });
      expect(result.passwordHash).toBeUndefined();
      expect(result.id).toBe('u1');
      expect(result.email).toBe('a@b.com');
    });

    it('throws ConflictException if email already exists', async () => {
      const existing: any = { id: 'u-old', email: 'a@b.com' };
      userRepo.findOne.mockResolvedValue(existing);

      await expect(userService.create('a@b.com', 'pw')).rejects.toThrow(ConflictException);
      expect(userRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns user without passwordHash', async () => {
      const found: any = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'secret',
        name: 'Alice',
      };
      userRepo.findOne.mockResolvedValue(found);

      const result = await userService.findById('u1');

      expect(result).toEqual({ id: 'u1', email: 'a@b.com', name: 'Alice' });
      expect(result.passwordHash).toBeUndefined();
    });

    it('returns null when not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      expect(await userService.findById('missing')).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('returns user on valid credentials', async () => {
      const user: any = { id: 'u1', email: 'a@b.com', passwordHash: 'hashed', isActive: true };
      userRepo.findOne.mockResolvedValue(user);
      bcryptMock.compare.mockResolvedValue(true);

      const result = await userService.validatePassword('a@b.com', 'pw');

      expect(result).toBe(user);
    });

    it('returns null on wrong password', async () => {
      const user: any = { id: 'u1', email: 'a@b.com', passwordHash: 'hashed', isActive: true };
      userRepo.findOne.mockResolvedValue(user);
      bcryptMock.compare.mockResolvedValue(false);

      expect(await userService.validatePassword('a@b.com', 'pw')).toBeNull();
    });

    it('returns null for inactive user', async () => {
      const user: any = { id: 'u1', email: 'a@b.com', passwordHash: 'hashed', isActive: false };
      userRepo.findOne.mockResolvedValue(user);

      expect(await userService.validatePassword('a@b.com', 'pw')).toBeNull();
    });

    it('returns null when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      expect(await userService.validatePassword('nope@b.com', 'pw')).toBeNull();
    });
  });
});
