import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [SandboxModule, ActivityModule],
  controllers: [BrowserController],
  providers: [BrowserService],
  exports: [BrowserService],
})
export class BrowserModule {}
