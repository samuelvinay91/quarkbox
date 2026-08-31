import {
  Controller,
  All,
  Get,
  Param,
  Req,
  Res,
  ParseIntPipe,
  ParseUUIDPipe,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { Request, Response } from 'express';

@ApiTags('proxy')
@Controller('proxy')
export class ProxyController {
  constructor(
    @Inject(ProxyService) private readonly proxyService: ProxyService,
  ) {}

  @Get(':sandboxId/ports')
  @ApiOperation({ summary: 'Get preview URLs for all active ports' })
  async getPorts(@Param('sandboxId', ParseUUIDPipe) sandboxId: string) {
    return this.proxyService.getPreviewUrls(sandboxId);
  }

  @All(':sandboxId/:port/*')
  @ApiOperation({ summary: 'Proxy HTTP traffic to a port inside the sandbox' })
  async proxySubpath(
    @Param('sandboxId', ParseUUIDPipe) sandboxId: string,
    @Param('port', ParseIntPipe) port: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Extract subpath after :port/
    const prefix = `/api/proxy/${sandboxId}/${port}`;
    const subpath = req.originalUrl.replace(prefix, '') || '/';

    await this.proxyService.forwardRequest(
      sandboxId,
      port,
      subpath,
      req.method,
      req.headers,
      req.body,
      res,
    );
  }
}
