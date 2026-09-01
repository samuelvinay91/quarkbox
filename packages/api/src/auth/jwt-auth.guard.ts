import { Injectable, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenRevocationService } from './token-revocation.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    @Inject(TokenRevocationService)
    private readonly tokenRevocationService: TokenRevocationService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // First, validate the JWT signature and expiry via Passport
    const isValid = await (super.canActivate(context) as Promise<boolean>);
    if (!isValid) return false;

    // Then check if the token has been revoked
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (token && await this.tokenRevocationService.isRevoked(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return true;
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return null;
  }
}
