import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from './activity.entity';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { RetentionModule } from '../common/retention.module';

@Module({
  // ActivityController needs RetentionService (for GET /activity/retention-status),
  // and RetentionService itself needs ActivityService — a genuine two-way
  // dependency between these modules, resolved with forwardRef on both sides
  // (see retention.module.ts).
  imports: [TypeOrmModule.forFeature([Activity]), forwardRef(() => RetentionModule)],
  providers: [ActivityService],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
