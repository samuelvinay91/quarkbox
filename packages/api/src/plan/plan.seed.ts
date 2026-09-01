import { Repository } from 'typeorm';
import { Plan } from './plan.entity';

export async function seedPlans(planRepo: Repository<Plan>): Promise<void> {
  const plans: Partial<Plan>[] = [
    {
      name: 'free',
      maxConcurrentSandboxes: 1,
      maxSandboxesPerDay: 10,
      maxCpuPerSandbox: 1,
      maxMemoryPerSandbox: '2g',
      maxClusters: 0,
      maxDiskPerSandbox: '5g',
      snapshotsEnabled: true,
    },
    {
      name: 'pro',
      maxConcurrentSandboxes: 5,
      maxSandboxesPerDay: 50,
      maxCpuPerSandbox: 2,
      maxMemoryPerSandbox: '4g',
      maxClusters: 1,
      maxDiskPerSandbox: '20g',
      snapshotsEnabled: true,
    },
    {
      name: 'enterprise',
      maxConcurrentSandboxes: 50,
      maxSandboxesPerDay: 500,
      maxCpuPerSandbox: 8,
      maxMemoryPerSandbox: '16g',
      maxClusters: 10,
      maxDiskPerSandbox: '100g',
      snapshotsEnabled: true,
    },
  ];

  for (const plan of plans) {
    const existing = await planRepo.findOne({ where: { name: plan.name } });
    if (!existing) {
      await planRepo.save(planRepo.create(plan));
    }
  }
}
