import { Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { SandboxModule } from '../sandbox/sandbox.module';

@Module({
  imports: [SandboxModule],
  providers: [ProxyService],
  controllers: [ProxyController],
  exports: [ProxyService],
})
export class ProxyModule {}
