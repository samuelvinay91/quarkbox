import {
  Controller,
  Get,
  Post,
  Put,
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
} from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';
import {
  CreateSandboxDto,
  UpdateSandboxDto,
  SandboxResponseDto,
  ExecCommandDto,
  ExecResultDto,
  RunPythonDto,
} from './dto';

@ApiTags('sandboxes')
@ApiBearerAuth()
@Controller('sandboxes')
export class SandboxController {
  constructor(
    @Inject(SandboxService) private readonly sandboxService: SandboxService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new sandbox' })
  @ApiResponse({ status: 201, type: SandboxResponseDto })
  async create(@Body() dto: CreateSandboxDto, @Request() req: any) {
    return this.sandboxService.create(dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all sandboxes' })
  @ApiResponse({ status: 200, type: [SandboxResponseDto] })
  async findAll(@Request() req: any) {
    return this.sandboxService.findAll(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sandbox by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SandboxResponseDto })
  @ApiResponse({ status: 404, description: 'Sandbox not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.findOne(id, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update sandbox metadata' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SandboxResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSandboxDto,
    @Request() req: any,
  ) {
    return this.sandboxService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sandbox' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Sandbox deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.remove(id, req.user.userId);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a stopped/paused sandbox' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SandboxResponseDto })
  async start(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.start(id, req.user.userId);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop a running sandbox' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SandboxResponseDto })
  async stop(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.stop(id, req.user.userId);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a running sandbox' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SandboxResponseDto })
  async pause(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.pause(id, req.user.userId);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused sandbox' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SandboxResponseDto })
  async resume(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.resume(id, req.user.userId);
  }

  // ── Exec ──────────────────────────────────────────────────────────

  @Post(':id/exec')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a command inside a sandbox' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ExecResultDto })
  async exec(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExecCommandDto,
    @Request() req: any,
  ) {
    return this.sandboxService.exec(id, dto.command, dto.workdir, req.user.userId);
  }

  // ── Agent SDK ───────────────────────────────────────────────────────

  @Post(':id/run-python')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a Python code block natively (Agent SDK)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ExecResultDto })
  async runPython(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunPythonDto,
    @Request() req: any,
  ) {
    return this.sandboxService.runPython(id, dto.code, req.user.userId);
  }

  // ── Deep Metrics ──────────────────────────────────────────────────

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get real-time container resource metrics (CPU/memory/network/IO from Docker stats API)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getStats(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.sandboxService.getStats(id, req.user.userId);
  }
}
