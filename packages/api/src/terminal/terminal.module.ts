import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule re-exports its configured JwtModule, which TerminalGateway
  // needs to verify the token on each WebSocket connection.
  imports: [SandboxModule, ConfigModule, AuthModule],
  providers: [TerminalGateway],
  exports: [TerminalGateway],
})
export class TerminalModule {}
