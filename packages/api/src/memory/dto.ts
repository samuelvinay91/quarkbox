import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsObject,
} from 'class-validator';

export class StoreMemoryDto {
  @ApiProperty()
  @IsString()
  agentId: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  key?: string;

  @ApiPropertyOptional({ enum: ['episodic', 'semantic', 'working', 'procedural'] })
  @IsOptional()
  @IsEnum(['episodic', 'semantic', 'working', 'procedural'])
  memoryType?: 'episodic' | 'semantic' | 'working' | 'procedural';

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  embedding?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SearchMemoryDto {
  @ApiProperty()
  @IsString()
  agentId: string;

  @ApiProperty()
  @IsString()
  query: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  embedding?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memoryType?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ default: 0.0 })
  @IsOptional()
  @IsNumber()
  minSimilarity?: number;
}
