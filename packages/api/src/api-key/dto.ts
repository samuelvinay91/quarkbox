import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI pipeline', description: 'Human-readable label for this key' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}

export class ApiKeyCreatedResponseDto {
  @ApiProperty({ description: 'The API key row id (use this to revoke)' })
  id!: string;

  @ApiProperty({
    description: 'The raw API key — shown exactly once. Store it now; it cannot be recovered later.',
    example: 'qkb_1a2b3c...',
  })
  key!: string;

  @ApiProperty({ description: 'First 8 characters of the key, safe to display later for identification' })
  keyPrefix!: string;
}

export class ApiKeyListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  keyPrefix!: string;

  @ApiPropertyOptional()
  lastUsedAt?: Date;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiProperty()
  createdAt!: Date;
}
