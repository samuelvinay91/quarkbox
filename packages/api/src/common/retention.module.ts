import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetentionService } from './retention.service';
import { Activity } from '../activity/activity.entity';
import { ActivityModule } from '../activity/activity.module';
import { RevokedToken } from '../auth/revoked-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Activity, RevokedToken]),
    ActivityModule,
  ],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
