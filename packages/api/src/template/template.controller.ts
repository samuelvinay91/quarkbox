import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TemplateService, LaunchTemplateDto } from './template.service';
import { MarketplaceTemplate, TemplateCategory } from './template.entity';

class LaunchDto {
  name!: string;
  envVars?: Record<string, string>;
  gitRepoUrl?: string;
  gitBranch?: string;
  customCpu?: number;
  customMemory?: string;
}

@ApiTags('templates')
@Controller('templates')
export class TemplateController {
  constructor(
    @Inject(TemplateService)
    private readonly templateService: TemplateService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Publish a custom environment template to the Marketplace' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(@Body() dto: Partial<MarketplaceTemplate>) {
    return this.templateService.createTemplate(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List and filter Golden Marketplace Templates' })
  @ApiQuery({ name: 'category', required: false, enum: TemplateCategory })
  @ApiQuery({ name: 'tag', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of templates' })
  async listTemplates(
    @Query('category') category?: TemplateCategory,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
  ): Promise<MarketplaceTemplate[]> {
    return this.templateService.findAll({ category, tag, search });
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all available template marketplace categories' })
  listCategories(): string[] {
    return Object.values(TemplateCategory);
  }

  @Get(':slugOrId')
  @ApiOperation({ summary: 'Get details for a specific golden template' })
  @ApiParam({ name: 'slugOrId', type: 'string', description: 'Template slug or UUID' })
  async getTemplate(@Param('slugOrId') slugOrId: string): Promise<MarketplaceTemplate> {
    return this.templateService.findOne(slugOrId);
  }

  @Post(':slugOrId/launch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '1-Click Launch: Spin up a sandbox from a golden template' })
  @ApiParam({ name: 'slugOrId', type: 'string' })
  @ApiBody({ type: LaunchDto })
  async launchTemplate(
    @Param('slugOrId') slugOrId: string,
    @Body() dto: LaunchDto,
  ) {
    return this.templateService.launchTemplate(slugOrId, dto);
  }
}
