import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [SandboxModule, ConfigModule],
  providers: [TerminalGateway],
  exports: [TerminalGateway],
})
export class TerminalModule {}
