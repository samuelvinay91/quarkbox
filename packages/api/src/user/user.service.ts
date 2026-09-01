import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(email: string, password: string, name?: string): Promise<Omit<User, 'passwordHash'>> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.userRepo.create({ email, passwordHash, name });
    const saved = await this.userRepo.save(user);

    const { passwordHash: _, ...result } = saved as any;
    return result;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findById(id: string): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return null;

    const { passwordHash: _, ...result } = user as any;
    return result;
  }

  async validatePassword(email: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !user.isActive) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    return user;
  }
}
