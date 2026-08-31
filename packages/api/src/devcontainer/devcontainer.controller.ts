import { Controller, Post, Param, ParseUUIDPipe, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DevcontainerService } from './devcontainer.service';

@ApiTags('devcontainer')
@ApiBearerAuth()
@Controller('devcontainer')
export class DevcontainerController {
  constructor(
    @Inject(DevcontainerService)
    private readonly devcontainerService: DevcontainerService,
  ) {}

  @Post('sandbox/:sandboxId/apply')
  @ApiOperation({ summary: 'Detect and apply devcontainer.json configuration in sandbox' })
  @ApiResponse({ status: 200 })
  async apply(@Param('sandboxId', ParseUUIDPipe) sandboxId: string) {
    return this.devcontainerService.applyDevcontainer(sandboxId);
  }
}
