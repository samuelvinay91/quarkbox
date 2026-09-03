import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BrowserService } from './browser.service';
import {
  NavigateDto,
  ScreenshotDto,
  ClickDto,
  ExtractContentDto,
  EvaluateScriptDto,
} from './dto';

@ApiTags('browser')
@ApiBearerAuth()
@Controller('sandboxes/:id/browser')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Post('navigate')
  @ApiOperation({ summary: 'Navigate browser to URL' })
  @ApiResponse({ status: 201, description: 'Navigation successful' })
  async navigate(
    @Param('id') id: string,
    @Body() dto: NavigateDto,
    @Req() req: any,
  ) {
    return this.browserService.navigate(id, dto, req.user?.userId);
  }

  @Post('screenshot')
  @ApiOperation({ summary: 'Take a screenshot of the current page' })
  @ApiResponse({ status: 201, description: 'Screenshot captured' })
  async takeScreenshot(
    @Param('id') id: string,
    @Body() dto: ScreenshotDto,
    @Req() req: any,
  ) {
    return this.browserService.takeScreenshot(id, dto, req.user?.userId);
  }

  @Post('click')
  @ApiOperation({ summary: 'Click an element by selector' })
  @ApiResponse({ status: 201, description: 'Click successful' })
  async click(
    @Param('id') id: string,
    @Body() dto: ClickDto,
    @Req() req: any,
  ) {
    return this.browserService.click(id, dto, req.user?.userId);
  }

  @Post('content')
  @ApiOperation({ summary: 'Extract content from the page' })
  @ApiResponse({ status: 201, description: 'Content extracted' })
  async extractContent(
    @Param('id') id: string,
    @Body() dto: ExtractContentDto,
    @Req() req: any,
  ) {
    return this.browserService.extractContent(id, dto, req.user?.userId);
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate script in page context' })
  @ApiResponse({ status: 201, description: 'Script evaluated' })
  async evaluate(
    @Param('id') id: string,
    @Body() dto: EvaluateScriptDto,
    @Req() req: any,
  ) {
    return this.browserService.evaluate(id, dto, req.user?.userId);
  }
}
