import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoolService } from './pool.service';
import { PoolController } from './pool.controller';
import { RuntimeModule } from '../runtime/runtime.module';
import { ConfigModule } from '@nestjs/config';
import { Sandbox } from '../sandbox/sandbox.entity';

@Module({
  imports: [RuntimeModule, ConfigModule, TypeOrmModule.forFeature([Sandbox])],
  providers: [PoolService],
  controllers: [PoolController],
  exports: [PoolService],
})
export class PoolModule {}
