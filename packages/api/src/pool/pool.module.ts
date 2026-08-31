import { Module } from '@nestjs/common';
import { PoolService } from './pool.service';
import { PoolController } from './pool.controller';
import { RuntimeModule } from '../runtime/runtime.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [RuntimeModule, ConfigModule],
  providers: [PoolService],
  controllers: [PoolController],
  exports: [PoolService],
})
export class PoolModule {}
