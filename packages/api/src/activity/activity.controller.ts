import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ActivityService } from './activity.service';

@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivityController {
  constructor(
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get global activity feed' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getGlobalFeed(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.activityService.getGlobalFeed(limit, offset);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get activity statistics' })
  @ApiResponse({ status: 200 })
  async getStats() {
    return this.activityService.getStats();
  }

  @Get('sandbox/:sandboxId')
  @ApiOperation({ summary: 'Get activity timeline for a specific sandbox' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getForSandbox(
    @Param('sandboxId', ParseUUIDPipe) sandboxId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.activityService.getForSandbox(sandboxId, limit, offset);
  }

  @Get('export/soc2')
  @ApiOperation({ summary: 'Export cryptographically signed SOC2 Type II / ISO-27001 audit ledger' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Signed SOC2 audit ledger with root hash digest' })
  async exportSoc2(
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
  ) {
    return this.activityService.exportSoc2Audit(limit);
  }
}
