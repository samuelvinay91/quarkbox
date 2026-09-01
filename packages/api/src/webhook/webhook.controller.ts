import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus, ParseUUIDPipe, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto, WEBHOOK_EVENTS } from './dto';

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('events')
  @ApiOperation({ summary: 'List supported webhook event types' })
  getEvents(): string[] {
    return [...WEBHOOK_EVENTS];
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks for the authenticated user' })
  async findAll(@Request() req: any) {
    return this.webhookService.listForUser(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new webhook' })
  @ApiResponse({ status: 201, description: 'Webhook created' })
  async create(@Body() dto: CreateWebhookDto, @Request() req: any) {
    return this.webhookService.create(req.user.userId, dto.url, dto.event, dto.secret);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Webhook deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.webhookService.remove(id, req.user.userId);
  }
}
