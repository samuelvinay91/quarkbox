import { Controller, Get, Post, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PoolService } from './pool.service';

@ApiTags('pool')
@Controller('pool')
export class PoolController {
  constructor(@Inject(PoolService) private readonly poolService: PoolService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current pre-warmed sandbox pool status' })
  @ApiResponse({ status: 200 })
  async getStatus() {
    return this.poolService.getPoolStatus();
  }

  @Post('replenish')
  @ApiOperation({ summary: 'Trigger manual pool replenishment' })
  @ApiResponse({ status: 200 })
  async triggerReplenish() {
    await this.poolService.replenish();
    return { status: 'replenishment triggered' };
  }
}
