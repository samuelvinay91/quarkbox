import {
  Controller,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ContextService } from './context.service';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class InjectGitDto {
  @IsString()
  repoUrl!: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  targetDir?: string;

  @IsOptional()
  @IsString()
  authToken?: string;
}

export class InjectSecretsDto {
  @IsObject()
  secrets!: Record<string, string>;

  @IsOptional()
  @IsString()
  filePath?: string;
}

export class CreateFromRepoDto {
  @IsString()
  name!: string;

  @IsString()
  repoUrl!: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  setupScript?: string;

  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;
}

@ApiTags('context')
@ApiBearerAuth()
@Controller('context')
export class ContextController {
  constructor(
    @Inject(ContextService) private readonly contextService: ContextService,
  ) {}

  @Post('sandbox/:sandboxId/git')
  @ApiOperation({ summary: 'Inject and clone a Git repository into sandbox' })
  async injectGit(
    @Param('sandboxId', ParseUUIDPipe) sandboxId: string,
    @Body() dto: InjectGitDto,
  ) {
    return this.contextService.injectGitRepo(sandboxId, dto);
  }

  @Post('sandbox/:sandboxId/secrets')
  @ApiOperation({ summary: 'Inject environment secrets into sandbox' })
  async injectSecrets(
    @Param('sandboxId', ParseUUIDPipe) sandboxId: string,
    @Body() dto: InjectSecretsDto,
  ) {
    await this.contextService.injectSecrets(
      sandboxId,
      dto.secrets,
      dto.filePath,
    );
    return { status: 'secrets injected' };
  }

  @Post('create-from-repo')
  @ApiOperation({
    summary: '1-Click Sandbox from Git repo with automated onboarding',
  })
  async createFromRepo(@Body() dto: CreateFromRepoDto) {
    return this.contextService.createFromRepo(dto);
  }
}
