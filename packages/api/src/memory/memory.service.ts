import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentMemory } from './memory.entity';
import { StoreMemoryDto, SearchMemoryDto } from './dto';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';

@Injectable()
export class MemoryService {
  constructor(
    @InjectRepository(AgentMemory)
    private readonly memoryRepository: Repository<AgentMemory>,
    private readonly activityService: ActivityService,
  ) {}

  async store(dto: StoreMemoryDto, userId?: string): Promise<AgentMemory> {
    const memory = this.memoryRepository.create({
      ...dto,
      userId,
    });
    
    const savedMemory = await this.memoryRepository.save(memory);
    
    await this.activityService.record({
      type: ActivityType.AGENT_MEMORY_STORED,
      summary: `Stored agent memory for ${dto.agentId}`,
      userId,
      sandboxId: dto.agentId,
      metadata: { memoryId: savedMemory.id, memoryType: dto.memoryType },
    });

    return savedMemory;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }

  async recall(dto: SearchMemoryDto, userId?: string): Promise<Array<AgentMemory & { similarity: number }>> {
    const { agentId, query, embedding, memoryType, limit = 10, minSimilarity = 0.0 } = dto;
    
    const queryBuilder = this.memoryRepository.createQueryBuilder('memory')
      .where('memory.agentId = :agentId', { agentId });
      
    if (memoryType) {
      queryBuilder.andWhere('memory.memoryType = :memoryType', { memoryType });
    }
    if (userId) {
      queryBuilder.andWhere('memory.userId = :userId', { userId });
    }
    
    const memories = await queryBuilder.getMany();
    
    let scoredMemories = memories.map(memory => {
      let similarity = 0;
      if (embedding && memory.embedding && Array.isArray(embedding) && Array.isArray(memory.embedding) && embedding.length === memory.embedding.length) {
        similarity = this.cosineSimilarity(embedding, memory.embedding);
      } else {
        // Fallback to keyword relevance match
        const queryTerms = query.toLowerCase().split(' ').filter(t => t.trim().length > 0);
        const contentStr = memory.content.toLowerCase();
        const keyStr = (memory.key || '').toLowerCase();
        let matchCount = 0;
        
        for (const term of queryTerms) {
          if (contentStr.includes(term)) matchCount += 1.0;
          if (keyStr.includes(term)) matchCount += 1.5; // weight key matches higher
        }
        
        // Normalize similarity between 0 and 1 roughly
        similarity = Math.min(matchCount / Math.max(queryTerms.length, 1), 1.0);
      }
      return { ...memory, similarity };
    });
    
    scoredMemories = scoredMemories
      .filter(m => m.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
      
    await this.activityService.record({
      type: ActivityType.AGENT_MEMORY_RECALLED,
      summary: `Recalled memories for agent ${agentId}`,
      userId,
      sandboxId: agentId,
      metadata: { query, resultsCount: scoredMemories.length },
    });

    return scoredMemories;
  }

  async listByAgent(agentId: string, memoryType?: string, limit: number = 100): Promise<AgentMemory[]> {
    const where: any = { agentId };
    if (memoryType) {
      where.memoryType = memoryType;
    }
    return this.memoryRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async deleteMemory(id: string, userId?: string): Promise<void> {
    const memory = await this.memoryRepository.findOne({ where: { id } });
    if (memory) {
      await this.memoryRepository.remove(memory);
      
      await this.activityService.record({
        type: ActivityType.AGENT_MEMORY_DELETED,
        summary: `Deleted memory ${id}`,
        userId,
        sandboxId: memory.agentId,
      });
    }
  }

  async clearAgentMemories(agentId: string, userId?: string): Promise<void> {
    await this.memoryRepository.delete({ agentId });
    
    await this.activityService.record({
      type: ActivityType.AGENT_MEMORY_CLEARED,
      summary: `Cleared memories for agent ${agentId}`,
      userId,
      sandboxId: agentId,
    });
  }
}
