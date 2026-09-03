import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto, ApiKeyCreatedResponseDto, ApiKeyListItemDto } from './dto';

/**
 * Mounted at 'auth/api-key' (not 'api-key') to keep the documented,
 * long-standing POST /api/auth/api-key generation path stable — this
 * replaces AuthController's dead, unhashed, never-persisted key issuance
 * with the real ApiKeyService, and adds the list/revoke siblings
 * ApiKeyService already supported but nothing ever exposed over HTTP.
 */
@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('auth/api-key')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate an API key for programmatic access' })
  @ApiResponse({ status: 200, type: ApiKeyCreatedResponseDto })
  async generate(
    @Request() req: any,
    @Body() body: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    return this.apiKeyService.generate(req.user.userId, body.name);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's API keys (never returns the raw key)" })
  @ApiResponse({ status: 200, type: [ApiKeyListItemDto] })
  async list(@Request() req: any): Promise<ApiKeyListItemDto[]> {
    return this.apiKeyService.listByUser(req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key (must be owned by the current user)' })
  @ApiResponse({ status: 204, description: 'Key revoked' })
  @ApiResponse({ status: 403, description: 'Not authorized to revoke this key' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revoke(@Request() req: any, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.apiKeyService.revoke(id, req.user.userId);
  }
}
