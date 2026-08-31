import { Controller, Post, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Generate a dev token for local development and testing.
   * In production, this endpoint would be disabled.
   */
  @Post('dev-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a development token (dev only)',
    description:
      'Generates a JWT for local development. Disabled in production.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      properties: {
        token: { type: 'string' },
        expiresIn: { type: 'string' },
      },
    },
  })
  generateDevToken() {
    const token = this.authService.generateDevToken();
    return {
      token,
      expiresIn: '24h',
      usage: 'Set as Authorization: Bearer <token> header',
    };
  }

  /**
   * Generate an API key for SDK/CLI access.
   */
  @Post('api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate an API key for programmatic access' })
  @ApiResponse({
    status: 200,
    schema: {
      properties: {
        id: { type: 'string' },
        key: { type: 'string' },
      },
    },
  })
  generateApiKey() {
    return this.authService.generateApiKey();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({
    status: 200,
    schema: {
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
      },
    },
  })
  getCurrentUser() {
    // TODO: Extract from JWT once auth guard is active
    return {
      id: 'dev-user',
      email: 'dev@quarkbox.local',
      name: 'Development User',
    };
  }
}
