import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentMemory } from './memory.entity';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentMemory]),
    ActivityModule,
  ],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService, TypeOrmModule],
})
export class MemoryModule {}
