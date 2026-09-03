import { Controller, Post, Body, Get, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MemoryService } from './memory.service';
import { StoreMemoryDto, SearchMemoryDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('memory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post()
  @ApiOperation({ summary: 'Store a new memory' })
  async storeMemory(@Body() dto: StoreMemoryDto, @Request() req: any) {
    return this.memoryService.store(dto, req.user?.id);
  }

  @Post('search')
  @ApiOperation({ summary: 'Search and recall memories' })
  async searchMemory(@Body() dto: SearchMemoryDto, @Request() req: any) {
    return this.memoryService.recall(dto, req.user?.id);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'List memories by agent' })
  async listMemories(
    @Param('agentId') agentId: string,
    @Query('memoryType') memoryType?: string,
    @Query('limit') limit?: number
  ) {
    return this.memoryService.listByAgent(agentId, memoryType, limit ? Number(limit) : undefined);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a single memory' })
  async deleteMemory(@Param('id') id: string, @Request() req: any) {
    await this.memoryService.deleteMemory(id, req.user?.id);
    return { success: true };
  }

  @Delete('agent/:agentId')
  @ApiOperation({ summary: 'Clear all memories for an agent' })
  async clearAgentMemories(@Param('agentId') agentId: string, @Request() req: any) {
    await this.memoryService.clearAgentMemories(agentId, req.user?.id);
    return { success: true };
  }
}
