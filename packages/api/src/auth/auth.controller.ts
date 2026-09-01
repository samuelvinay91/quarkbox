import { Controller, Post, Get, HttpCode, HttpStatus, Request, NotFoundException, BadRequestException, Body } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { TokenRevocationService } from './token-revocation.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import { MfaService } from './mfa.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly activityService: ActivityService,
    private readonly mfaService: MfaService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({
    schema: {
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
        name: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() body: { email: string; password: string; name?: string }) {
    const { email, password, name } = body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Valid email is required');
    }
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const result = await this.authService.register(email, password, name);
    
    await this.activityService.record({
      type: ActivityType.AUTH_REGISTER,
      summary: 'User registered',
      userId: result.user.id,
      metadata: { email },
    });

    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    schema: {
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
        mfaCode: { type: 'string', description: 'TOTP code (required if MFA is enabled)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: { email: string; password: string; mfaCode?: string }) {
    try {
      const result = await this.authService.login(body.email, body.password);
      
      // Check if MFA is required
      const mfaRequired = await this.mfaService.isMfaEnabled(result.user.id);
      if (mfaRequired) {
        if (!body.mfaCode) {
          await this.activityService.record({
            type: ActivityType.AUTH_LOGIN_SUCCESS,
            summary: 'User authenticated, MFA required',
            userId: result.user.id,
          });
          return { mfaRequired: true, message: 'MFA code required' };
        }
        const mfaValid = await this.mfaService.verifyCode(result.user.id, body.mfaCode);
        if (!mfaValid) {
          await this.activityService.record({
            type: ActivityType.AUTH_LOGIN_FAILED,
            summary: 'MFA verification failed',
            userId: result.user.id,
            isError: true,
          });
          throw new BadRequestException('Invalid MFA code');
        }
      }

      await this.activityService.record({
        type: ActivityType.AUTH_LOGIN_SUCCESS,
        summary: 'User logged in successfully',
        userId: result.user.id,
      });

      return result;
    } catch (error: any) {
      await this.activityService.record({
        type: ActivityType.AUTH_LOGIN_FAILED,
        summary: 'User login failed',
        metadata: { email: body.email, error: error.message },
        isError: true,
      });
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Request() req: any) {
    const authHeader = req.headers?.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (token) {
      await this.tokenRevocationService.revoke(token, req.user?.userId, 'user_logout');
    }

    await this.activityService.record({
      type: ActivityType.AUTH_LOGOUT,
      summary: 'User logged out',
      userId: req.user?.userId,
    });

    return { message: 'Logged out successfully' };
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set up MFA (generates TOTP secret and QR code URL)' })
  @ApiResponse({ status: 200, description: 'MFA setup initiated' })
  async setupMfa(@Request() req: any) {
    return this.mfaService.setupMfa(req.user.userId);
  }

  @Post('mfa/verify')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP code and enable MFA' })
  @ApiBody({ schema: { required: ['code'], properties: { code: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'MFA enabled' })
  async verifyMfa(@Request() req: any, @Body() body: { code: string }) {
    if (!body.code) throw new BadRequestException('TOTP code is required');
    return this.mfaService.verifyAndEnable(req.user.userId, body.code);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA (requires valid TOTP code)' })
  @ApiBody({ schema: { required: ['code'], properties: { code: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'MFA disabled' })
  async disableMfa(@Request() req: any, @Body() body: { code: string }) {
    if (!body.code) throw new BadRequestException('TOTP code is required');
    return this.mfaService.disableMfa(req.user.userId, body.code);
  }

  /**
   * Generate a dev token for local development and testing.
   * In production, this endpoint would be disabled.
   */
  @Public()
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
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
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
  @UseGuards(AuthGuard('jwt'))
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

  @ApiBearerAuth()
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
  getCurrentUser(@Request() req: any) {
    return {
      id: req.user?.userId || 'unknown',
      email: req.user?.email || 'unknown',
      name: req.user?.name || 'unknown',
    };
  }
}
