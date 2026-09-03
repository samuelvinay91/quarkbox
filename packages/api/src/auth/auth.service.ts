import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';

export interface TokenPayload {
  sub: string;
  email?: string;
  name?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  /**
   * Generate a JWT token for a user
   */
  generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return this.jwtService.sign(payload);
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): TokenPayload {
    return this.jwtService.verify<TokenPayload>(token);
  }

  /**
   * Generate a dev token for local development
   * This bypasses GitHub OAuth for convenience during development.
   */
  generateDevToken(): string {
    return this.generateToken({
      sub: 'dev-user',
      email: 'dev@quarkbox.local',
      name: 'Development User',
    });
  }

  async register(email: string, password: string, name?: string) {
    const user = await this.userService.create(email, password, name);
    const token = this.generateToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });
    return { user, token };
  }

  async login(email: string, password: string) {
    const user = await this.userService.validatePassword(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.generateToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }
}
