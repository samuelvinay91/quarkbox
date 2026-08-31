import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { SandboxRuntime } from './sandbox.entity';

export class CreateSandboxDto {
  @ApiProperty({ example: 'my-dev-env', description: 'Sandbox name' })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message: 'Name must start with alphanumeric and contain only alphanumeric, hyphens, underscores',
  })
  name!: string;

  @ApiPropertyOptional({ example: 'Python ML sandbox' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 'python:3.12-slim',
    default: 'ubuntu:22.04',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: SandboxRuntime, default: SandboxRuntime.DOCKER })
  @IsOptional()
  @IsEnum(SandboxRuntime)
  runtime?: SandboxRuntime;

  @ApiPropertyOptional({ example: 2, default: 1, description: 'CPU cores' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  cpuLimit?: number;

  @ApiPropertyOptional({
    example: '1g',
    default: '512m',
    description: 'Memory limit (e.g., 512m, 1g, 2g)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+[mg]$/i, { message: 'Memory must be in format like 512m or 2g' })
  memoryLimit?: string;

  @ApiPropertyOptional({ example: '10g', default: '10g', description: 'Disk limit' })
  @IsOptional()
  @IsString()
  diskLimit?: string;

  @ApiPropertyOptional({
    example: { '8080': '8080', '3000': '3000' },
    description: 'Port mappings (container:host)',
  })
  @IsOptional()
  @IsObject()
  ports?: Record<string, string>;

  @ApiPropertyOptional({
    example: { NODE_ENV: 'development' },
    description: 'Environment variables',
  })
  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;

  @ApiPropertyOptional({
    example: { project: 'ml-pipeline' },
    description: 'Custom labels',
  })
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;
}

export class UpdateSandboxDto {
  @ApiPropertyOptional({ example: 'renamed-sandbox' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: { project: 'updated' } })
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;
}

export class SandboxResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  runtime!: string;

  @ApiProperty()
  image!: string;

  @ApiPropertyOptional()
  containerIp?: string;

  @ApiProperty()
  cpuLimit!: number;

  @ApiProperty()
  memoryLimit!: string;

  @ApiProperty()
  ports!: Record<string, string>;

  @ApiProperty()
  envVars!: Record<string, string>;

  @ApiProperty()
  labels!: Record<string, string>;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional()
  lastActiveAt?: Date;
}

export class ExecCommandDto {
  @ApiProperty({
    example: 'echo "Hello from QuarkBox"',
    description: 'Command to execute inside the sandbox',
  })
  @IsString()
  command!: string;

  @ApiPropertyOptional({
    example: '/workspace',
    description: 'Working directory for the command',
  })
  @IsOptional()
  @IsString()
  workdir?: string;
}

export class ExecResultDto {
  @ApiProperty()
  exitCode!: number;

  @ApiProperty()
  stdout!: string;

  @ApiProperty()
  stderr!: string;
}

export class RunPythonDto {
  @ApiProperty({
    example: 'import pandas as pd\nprint("Hello from AI Agent")',
    description: 'Python code to execute natively inside the sandbox',
  })
  @IsString()
  code!: string;
}
