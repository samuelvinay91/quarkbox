import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UserModule } from '../user/user.module';
import { ActivityModule } from '../activity/activity.module';
import { RevokedToken } from './revoked-token.entity';
import { TokenRevocationService } from './token-revocation.service';
import { MfaService } from './mfa.service';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    ActivityModule,
    TypeOrmModule.forFeature([RevokedToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (() => {
          const secret = config.get<string>('JWT_SECRET');
          if (!secret) {
            throw new Error('JWT_SECRET environment variable is required');
          }
          return secret;
        })(),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRATION', '24h') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenRevocationService, MfaService],
  exports: [AuthService, JwtModule, JwtStrategy, TokenRevocationService, MfaService],
})
export class AuthModule {}
