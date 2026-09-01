import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Inject,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ClusterService, CreateClusterDto } from './cluster.service';
import { Cluster } from './cluster.entity';

@ApiTags('clusters')
@ApiBearerAuth()
@Controller('clusters')
export class ClusterController {
  constructor(
    @Inject(ClusterService)
    private readonly clusterService: ClusterService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all active multi-sandbox clusters' })
  @ApiResponse({ status: 200, description: 'List of clusters' })
  async listClusters(@Request() req: any): Promise<Cluster[]> {
    return this.clusterService.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cluster details and all its member node sandboxes' })
  @ApiParam({ name: 'id', type: 'string', description: 'Cluster UUID' })
  async getCluster(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.clusterService.findOne(id, req.user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Spin up an entire multi-sandbox cluster topology atomically at once' })
  @ApiBody({
    description: 'Cluster topology specification containing nodes, images/templates, and DNS aliases',
  })
  async createCluster(@Body() dto: CreateClusterDto, @Request() req: any) {
    return this.clusterService.createCluster({ ...dto, userId: req.user.userId });
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop all sandboxes in a cluster' })
  @ApiParam({ name: 'id', type: 'string' })
  async stopCluster(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.clusterService.stopCluster(id, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tear down and destroy entire cluster mesh and its private network' })
  @ApiParam({ name: 'id', type: 'string' })
  async destroyCluster(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.clusterService.destroyCluster(id, req.user.userId);
  }
}
