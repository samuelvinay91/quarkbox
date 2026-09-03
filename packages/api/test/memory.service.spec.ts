import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MemoryService } from '../src/memory/memory.service';
import { AgentMemory } from '../src/memory/memory.entity';
import { ActivityService } from '../src/activity/activity.service';

describe('MemoryService', () => {
  let service: MemoryService;

  let queryBuilder: any;
  const mockMemoryRepo = {
    create: vi.fn(),
    save: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
    delete: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const mockActivityService = {
    record: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    queryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
    };
    mockMemoryRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: getRepositoryToken(AgentMemory), useValue: mockMemoryRepo },
        { provide: ActivityService, useValue: mockActivityService },
      ],
    }).compile();

    service = module.get(MemoryService);
  });

  describe('store', () => {
    it('creates and saves agent memory record and logs activity', async () => {
      const dto = {
        agentId: 'agent-1',
        content: 'User prefers dark mode and TypeScript.',
        key: 'user-preferences',
        memoryType: 'semantic' as const,
        embedding: [0.1, 0.2, 0.3],
        metadata: { source: 'chat' },
      };

      mockMemoryRepo.create.mockImplementation((val) => val);
      mockMemoryRepo.save.mockImplementation((val) => Promise.resolve({ id: 'mem-1', ...val, createdAt: new Date() }));

      const result = await service.store(dto, 'user-1');

      expect(result.id).toBe('mem-1');
      expect(result.content).toBe(dto.content);
      expect(mockActivityService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: 'Stored agent memory for agent-1',
        }),
      );
    });
  });

  describe('recall with vector cosine similarity', () => {
    it('computes cosine similarity and ranks memories correctly', async () => {
      const memories: Partial<AgentMemory>[] = [
        {
          id: 'mem-orthogonal',
          agentId: 'agent-1',
          content: 'Unrelated database migration info',
          embedding: [0, 1, 0], // orthogonal to [1, 0, 0] -> similarity 0
          createdAt: new Date(),
        },
        {
          id: 'mem-parallel',
          agentId: 'agent-1',
          content: 'Exact vector alignment topic',
          embedding: [1, 0, 0], // parallel to [1, 0, 0] -> similarity 1
          createdAt: new Date(),
        },
        {
          id: 'mem-partial',
          agentId: 'agent-1',
          content: 'Partial match topic',
          embedding: [0.7071, 0.7071, 0], // 45 deg to [1, 0, 0] -> similarity ~0.707
          createdAt: new Date(),
        },
      ];

      queryBuilder.getMany.mockResolvedValue(memories);

      const results = await service.recall({
        agentId: 'agent-1',
        query: 'vector topic',
        embedding: [1, 0, 0],
        limit: 5,
        minSimilarity: 0.1,
      });

      expect(results.length).toBe(2);
      expect(results[0].id).toBe('mem-parallel');
      expect(results[0].similarity).toBeCloseTo(1.0);
      expect(results[1].id).toBe('mem-partial');
      expect(results[1].similarity).toBeCloseTo(0.707, 2);
    });
  });

  describe('recall with keyword search fallback', () => {
    it('ranks memories based on keyword token overlap when no embeddings are provided', async () => {
      const memories: Partial<AgentMemory>[] = [
        {
          id: 'mem-low',
          agentId: 'agent-1',
          content: 'This mentions react once.',
          key: 'frontend',
          createdAt: new Date(),
        },
        {
          id: 'mem-high',
          agentId: 'agent-1',
          content: 'React component optimization and react architecture.',
          key: 'react',
          createdAt: new Date(),
        },
        {
          id: 'mem-none',
          agentId: 'agent-1',
          content: 'Something completely different.',
          key: 'backend',
          createdAt: new Date(),
        },
      ];

      queryBuilder.getMany.mockResolvedValue(memories);

      const results = await service.recall({
        agentId: 'agent-1',
        query: 'react architecture',
        limit: 5,
        minSimilarity: 0.1,
      });

      expect(results.length).toBe(2);
      expect(results[0].id).toBe('mem-high');
      expect(results[1].id).toBe('mem-low');
    });
  });

  describe('listByAgent', () => {
    it('queries memories filtered by agentId and memoryType', async () => {
      mockMemoryRepo.find.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.listByAgent('agent-1', 'episodic', 10);

      expect(result).toHaveLength(1);
      expect(mockMemoryRepo.find).toHaveBeenCalledWith({
        where: { agentId: 'agent-1', memoryType: 'episodic' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
    });
  });

  describe('deleteMemory & clearAgentMemories', () => {
    it('deletes specific memory and records activity', async () => {
      mockMemoryRepo.findOne.mockResolvedValue({ id: 'mem-1', agentId: 'agent-1' });
      mockMemoryRepo.remove.mockResolvedValue({ id: 'mem-1' });

      await service.deleteMemory('mem-1', 'user-1');

      expect(mockMemoryRepo.findOne).toHaveBeenCalledWith({ where: { id: 'mem-1' } });
      expect(mockMemoryRepo.remove).toHaveBeenCalled();
      expect(mockActivityService.record).toHaveBeenCalled();
    });

    it('clears all memories for an agent', async () => {
      mockMemoryRepo.delete.mockResolvedValue({ affected: 4 });

      await service.clearAgentMemories('agent-1', 'user-1');

      expect(mockMemoryRepo.delete).toHaveBeenCalledWith({ agentId: 'agent-1' });
      expect(mockActivityService.record).toHaveBeenCalled();
    });
  });
});
