import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { SnapshotService } from './snapshot.service';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateSnapshotDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ForkSandboxDto {
  @IsString()
  @MaxLength(255)
  forkName!: string;
}

@ApiTags('snapshots')
@ApiBearerAuth()
@Controller('snapshots')
export class SnapshotController {
  constructor(
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all snapshots' })
  @ApiQuery({ name: 'sandboxId', required: false })
  async findAll(@Query('sandboxId') sandboxId: string | undefined, @Request() req: any) {
    return this.snapshotService.findAll(sandboxId, req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get snapshot by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.snapshotService.findOne(id, req.user.userId);
  }

  @Post('sandbox/:sandboxId')
  @ApiOperation({ summary: 'Create a snapshot from a sandbox' })
  async create(
    @Param('sandboxId', ParseUUIDPipe) sandboxId: string,
    @Body() dto: CreateSnapshotDto,
    @Request() req: any,
  ) {
    return this.snapshotService.createSnapshot({
      sandboxId,
      name: dto.name,
      description: dto.description,
      userId: req.user.userId,
    });
  }

  @Post('sandbox/:sandboxId/fork')
  @ApiOperation({ summary: '1-Click Fork: Clone a sandbox with all files & state' })
  async fork(
    @Param('sandboxId', ParseUUIDPipe) sandboxId: string,
    @Body() dto: ForkSandboxDto,
    @Request() req: any,
  ) {
    return this.snapshotService.forkSandbox(sandboxId, dto.forkName, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a snapshot' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.snapshotService.remove(id, req.user.userId);
  }
}
