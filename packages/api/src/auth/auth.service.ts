import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';

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

  constructor(private readonly jwtService: JwtService) {}

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
   * Generate an API key for programmatic access (SDK, CLI)
   * In production, this would be stored hashed in the database.
   */
  generateApiKey(): { id: string; key: string } {
    const id = uuidv4();
    const key = `qb_${Buffer.from(uuidv4() + uuidv4()).toString('base64url')}`;
    this.logger.log(`Generated API key: ${id}`);
    return { id, key };
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
}
