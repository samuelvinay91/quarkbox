import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUrl, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const WEBHOOK_EVENTS = [
  'sandbox.created',
  'sandbox.updated',
  'sandbox.deleted',
  'sandbox.started',
  'sandbox.stopped',
  'snapshot.created',
  'snapshot.restored',
  'cluster.created',
  'cluster.destroyed',
  'command.executed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhook', description: 'Webhook delivery URL' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({ example: 'sandbox.created', enum: WEBHOOK_EVENTS, description: 'Event type to subscribe to' })
  @IsIn(WEBHOOK_EVENTS as unknown as string[])
  event: string;

  @ApiPropertyOptional({ description: 'HMAC signing secret (auto-generated if omitted)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  secret?: string;
}
