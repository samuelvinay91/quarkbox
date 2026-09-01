import {
  Controller,
  Get,
  Param,
  Query,
  Request,
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
import { Roles } from '../auth/roles.decorator';
import { RetentionService } from '../common/retention.service';

@ApiTags('activity')
@ApiBearerAuth()
@Controller('activity')
export class ActivityController {
  constructor(
    @Inject(ActivityService) private readonly activityService: ActivityService,
    private readonly retentionService: RetentionService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the user's audit trail" })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200 })
  async getAuditTrail(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.activityService.getAuditTrail(req.user.userId, limit, offset);
  }

  @Get('stats')
  @ApiOperation({ summary: "Get the user's activity statistics" })
  @ApiResponse({ status: 200 })
  async getStats(@Request() req: any) {
    return this.activityService.getStats(req.user.userId);
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
  @Roles('admin')
  @ApiOperation({ summary: 'Export cryptographically signed SOC2 Type II / ISO-27001 audit ledger' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Signed SOC2 audit ledger with root hash digest' })
  async exportSoc2(
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
  ) {
    return this.activityService.exportSoc2Audit(limit);
  }

  @Get('retention-status')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get data retention status (admin only)' })
  async getRetentionStatus() {
    return this.retentionService.getRetentionStatus();
  }
}
