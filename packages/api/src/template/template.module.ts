import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { MarketplaceTemplate } from './template.entity';
import { SandboxModule } from '../sandbox/sandbox.module';
import { ContextModule } from '../context/context.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketplaceTemplate]),
    SandboxModule,
    ContextModule,
    ActivityModule,
  ],
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
