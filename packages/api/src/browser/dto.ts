import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class NavigateDto {
  @ApiProperty()
  @IsString()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waitForSelector?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  timeoutMs?: number;
}

export class ScreenshotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fullPage?: boolean;

  @ApiPropertyOptional({ enum: ['png', 'jpeg'] })
  @IsOptional()
  @IsEnum(['png', 'jpeg'])
  format?: 'png' | 'jpeg';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class ClickDto {
  @ApiProperty()
  @IsString()
  selector!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  waitForNavigation?: boolean;
}

export class ExtractContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selector?: string;

  @ApiPropertyOptional({ enum: ['html', 'text', 'markdown'] })
  @IsOptional()
  @IsEnum(['html', 'text', 'markdown'])
  format?: 'html' | 'text' | 'markdown';
}

export class EvaluateScriptDto {
  @ApiProperty()
  @IsString()
  script!: string;
}
