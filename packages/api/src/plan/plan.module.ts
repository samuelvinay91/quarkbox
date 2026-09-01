import { Module, Global, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';
import { Sandbox } from '../sandbox/sandbox.entity';
import { Cluster } from '../cluster/cluster.entity';
import { QuotaService } from './quota.service';
import { seedPlans } from './plan.seed';
import { PlanController } from './plan.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Plan, Sandbox, Cluster])],
  controllers: [PlanController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class PlanModule implements OnModuleInit {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  async onModuleInit() {
    await seedPlans(this.planRepo);
  }
}
