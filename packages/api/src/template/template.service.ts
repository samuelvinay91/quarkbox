import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import {
  MarketplaceTemplate,
  TemplateCategory,
} from './template.entity';
import { SandboxService } from '../sandbox/sandbox.service';
import { Sandbox } from '../sandbox/sandbox.entity';
import { ContextService } from '../context/context.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';

export const GOLDEN_TEMPLATES_SEED: Array<Partial<MarketplaceTemplate>> = [
  {
    slug: 'langgraph-agent-harness',
    name: 'LangGraph & CrewAI Agent Harness',
    category: TemplateCategory.AI_AGENTS,
    description:
      'Pre-configured Python 3.12 environment with LangChain, LangGraph, CrewAI, AutoGen, Ollama client, and OpenAI/Anthropic SDKs ready for multi-agent autonomous execution.',
    icon: '🤖',
    image: 'python:3.12-slim',
    defaultCpu: 4,
    defaultMemory: '2g',
    defaultDisk: '10g',
    publisher: 'QuarkBox Golden AI',
    isOfficial: true,
    isVerified: true,
    launchesCount: 1420,
    tags: ['ai-agent', 'langchain', 'langgraph', 'crewai', 'autogen', 'python'],
    recommendedWorkdir: '/workspace',
    ports: [
      { port: 8000, label: 'Agent Webhook Server', protocol: 'http', autoForward: true },
      { port: 8501, label: 'Streamlit Agent UI', protocol: 'http', autoForward: true },
    ],
    envVars: [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', description: 'API Key for GPT models', required: false, secret: true },
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', description: 'API Key for Claude models', required: false, secret: true },
    ],
    postLaunchScript: `python3 -m pip install --quiet --upgrade pip && python3 -m pip install --quiet langchain langgraph crewai requests psutil uvicorn fastapi`,
  },
  {
    slug: 'pytorch-cuda-studio',
    name: 'PyTorch & Transformers ML Studio',
    category: TemplateCategory.DATA_SCIENCE,
    description:
      'High-performance Python ML sandbox with PyTorch 2.4, Hugging Face Transformers, Datasets, Pandas, Scikit-Learn, and JupyterLab server pre-wired.',
    icon: '⚡',
    image: 'python:3.12-slim',
    defaultCpu: 4,
    defaultMemory: '4g',
    defaultDisk: '20g',
    publisher: 'QuarkBox ML Labs',
    isOfficial: true,
    isVerified: true,
    launchesCount: 2890,
    tags: ['pytorch', 'huggingface', 'transformers', 'jupyter', 'cuda', 'ml'],
    recommendedWorkdir: '/workspace',
    ports: [
      { port: 8888, label: 'JupyterLab Notebook', protocol: 'http', autoForward: true },
    ],
    envVars: [
      { key: 'HF_TOKEN', label: 'HuggingFace Token', description: 'Access gated model weights', required: false, secret: true },
    ],
    postLaunchScript: `python3 -m pip install --quiet torch torchvision transformers datasets accelerate pandas scikit-learn jupyterlab`,
  },
  {
    slug: 'nextjs15-fullstack-dev',
    name: 'Next.js 15 & React 19 Full-Stack',
    category: TemplateCategory.WEB_FULLSTACK,
    description:
      'Ultra-fast Next.js 15 App Router environment with Tailwind CSS v4, TypeScript, Node.js 20, pnpm, and automatic Hot Module Replacement (HMR) reverse proxy.',
    icon: '▲',
    image: 'node:20-alpine',
    defaultCpu: 2,
    defaultMemory: '2g',
    defaultDisk: '10g',
    publisher: 'QuarkBox Web',
    isOfficial: true,
    isVerified: true,
    launchesCount: 5120,
    tags: ['nextjs', 'react', 'typescript', 'tailwind', 'fullstack', 'nodejs'],
    recommendedWorkdir: '/app',
    ports: [
      { port: 3000, label: 'Next.js Dev Server', protocol: 'http', autoForward: true },
    ],
    envVars: [
      { key: 'PORT', label: 'Server Port', description: 'Application listen port', defaultValue: '3000', required: false },
    ],
    postLaunchScript: `apk add --no-cache git bash curl && npm install -g pnpm`,
  },
  {
    slug: 'fastapi-pgvector-microservice',
    name: 'FastAPI & Postgres pgvector Backend',
    category: TemplateCategory.SYSTEMS_BACKEND,
    description:
      'Production-ready Python FastAPI async REST / OpenAPI microservice environment with Pydantic v2, SQLAlchemy async, and pgvector embeddings integration.',
    icon: '🐍',
    image: 'python:3.12-slim',
    defaultCpu: 2,
    defaultMemory: '1g',
    defaultDisk: '10g',
    publisher: 'QuarkBox Backend',
    isOfficial: true,
    isVerified: true,
    launchesCount: 1840,
    tags: ['fastapi', 'pydantic', 'pgvector', 'asyncio', 'rest', 'api'],
    recommendedWorkdir: '/app',
    ports: [
      { port: 8000, label: 'FastAPI Docs / API', protocol: 'http', autoForward: true },
    ],
    envVars: [
      { key: 'DATABASE_URL', label: 'Database Connection URL', description: 'Postgres connection string', defaultValue: 'postgresql+asyncpg://postgres:postgres@localhost:5432/app', required: false, secret: true },
    ],
    postLaunchScript: `python3 -m pip install --quiet fastapi uvicorn pydantic sqlalchemy asyncpg pgvector httpx`,
  },
  {
    slug: 'go-microservices-grpc',
    name: 'Go 1.22 Cloud Microservices & gRPC',
    category: TemplateCategory.SYSTEMS_BACKEND,
    description:
      'Modern Go 1.22 runtime with Protobuf / gRPC compiler toolchain, Air live-reloading, Gin web framework, and distributed tracing instrumentation.',
    icon: '🔷',
    image: 'golang:1.22-alpine',
    defaultCpu: 2,
    defaultMemory: '1g',
    defaultDisk: '10g',
    publisher: 'QuarkBox Cloud',
    isOfficial: true,
    isVerified: true,
    launchesCount: 1650,
    tags: ['golang', 'grpc', 'protobuf', 'gin', 'cloud', 'microservices'],
    recommendedWorkdir: '/go/src/app',
    ports: [
      { port: 8080, label: 'HTTP REST API', protocol: 'http', autoForward: true },
      { port: 9090, label: 'gRPC Server', protocol: 'grpc', autoForward: true },
    ],
    envVars: [],
    postLaunchScript: `apk add --no-cache git bash curl protobuf make && go install github.com/air-verse/air@latest`,
  },
  {
    slug: 'rust-wasm-systems',
    name: 'Rust 1.82 & WebAssembly Studio',
    category: TemplateCategory.SYSTEMS_BACKEND,
    description:
      'High-performance Rust 1.82 compilation environment with Cargo, Clippy, rustfmt, wasm-pack, and WebAssembly / WASI execution runtimes.',
    icon: '🦀',
    image: 'rust:1.82-slim',
    defaultCpu: 4,
    defaultMemory: '2g',
    defaultDisk: '15g',
    publisher: 'QuarkBox Systems',
    isOfficial: true,
    isVerified: true,
    launchesCount: 980,
    tags: ['rust', 'wasm', 'wasi', 'cargo', 'systems'],
    recommendedWorkdir: '/workspace',
    ports: [
      { port: 8080, label: 'WASM Web Server', protocol: 'http', autoForward: true },
    ],
    envVars: [],
    postLaunchScript: `apt-get update -qq && apt-get install -y -qq git curl pkg-config libssl-dev && cargo --version`,
  },
  {
    slug: 'devops-cloud-toolchain',
    name: 'DevOps, Terraform & K8s Toolchain',
    category: TemplateCategory.DEVOPS_CLOUD,
    description:
      'Cloud engineering sandbox with Terraform 1.9, Kubectl, Helm 3, AWS/GCP/Azure CLIs, Docker CLI, k9s, and GitHub CLI pre-installed.',
    icon: '☁️',
    image: 'ubuntu:22.04',
    defaultCpu: 2,
    defaultMemory: '2g',
    defaultDisk: '15g',
    publisher: 'QuarkBox Platform',
    isOfficial: true,
    isVerified: true,
    launchesCount: 2210,
    tags: ['devops', 'terraform', 'kubernetes', 'helm', 'cloud', 'docker'],
    recommendedWorkdir: '/workspace',
    ports: [],
    envVars: [
      { key: 'AWS_REGION', label: 'AWS Region', description: 'Default AWS deployment region', defaultValue: 'us-east-1', required: false },
    ],
    postLaunchScript: `apt-get update -qq && apt-get install -y -qq curl wget git unzip jq`,
  },
  {
    slug: 'claude-code-dev-workspace',
    name: 'Claude Code & AI Engineer Workspace',
    category: TemplateCategory.AI_AGENTS,
    description:
      'Dedicated sandbox pre-configured for Claude Code, Cursor background agents, and Windsurf, with full dev tools, ripgrep, git, Python, Node, and MCP bridges.',
    icon: '🧠',
    image: 'ubuntu:22.04',
    defaultCpu: 4,
    defaultMemory: '4g',
    defaultDisk: '20g',
    publisher: 'QuarkBox AI Labs',
    isOfficial: true,
    isVerified: true,
    launchesCount: 4320,
    tags: ['claude-code', 'ai-engineer', 'mcp', 'agent-workspace', 'cursor'],
    recommendedWorkdir: '/workspace',
    ports: [
      { port: 3000, label: 'Preview Web App', protocol: 'http', autoForward: true },
      { port: 8080, label: 'Backend API Preview', protocol: 'http', autoForward: true },
    ],
    envVars: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic Key', description: 'Claude API key for background agent tools', required: false, secret: true },
    ],
    postLaunchScript: `apt-get update -qq && apt-get install -y -qq git curl python3 python3-pip nodejs npm ripgrep jq`,
  },
];

export interface LaunchTemplateDto {
  name: string;
  envVars?: Record<string, string>;
  gitRepoUrl?: string;
  gitBranch?: string;
  customCpu?: number;
  customMemory?: string;
  userId?: string;
}

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(MarketplaceTemplate)
    private readonly templateRepo: Repository<MarketplaceTemplate>,
    @Inject(SandboxService)
    private readonly sandboxService: SandboxService,
    @Inject(ContextService)
    private readonly contextService: ContextService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedGoldenTemplates();
  }

  /**
   * Seed default verified golden templates if table is empty
   */
  async seedGoldenTemplates(): Promise<void> {
    try {
      const count = await this.templateRepo.count();
      if (count === 0) {
        this.logger.log('📦 Seeding QuarkBox Golden Template Marketplace...');
        for (const t of GOLDEN_TEMPLATES_SEED) {
          const entity = this.templateRepo.create(t);
          await this.templateRepo.save(entity);
        }
        this.logger.log(`✅ Seeded ${GOLDEN_TEMPLATES_SEED.length} verified golden templates.`);
      }
    } catch (e: any) {
      this.logger.warn(`Could not seed templates: ${e.message}`);
    }
  }

  /**
   * List / Search marketplace templates with filtering
   */
  async findAll(query?: {
    category?: TemplateCategory;
    tag?: string;
    search?: string;
  }): Promise<MarketplaceTemplate[]> {
    const qb = this.templateRepo.createQueryBuilder('t');

    if (query?.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }

    if (query?.tag) {
      qb.andWhere('t.tags LIKE :tag', { tag: `%${query.tag}%` });
    }

    if (query?.search) {
      qb.andWhere(
        '(t.name LIKE :search OR t.description LIKE :search OR t.slug LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('t.launchesCount', 'DESC');
    return qb.getMany();
  }

  /**
   * Get template by slug or ID
   */
  async findOne(slugOrId: string): Promise<MarketplaceTemplate> {
    let template = await this.templateRepo.findOne({
      where: [{ id: slugOrId }, { slug: slugOrId }],
    });

    if (!template) {
      // Fallback search in memory seed for fast dev
      const seed = GOLDEN_TEMPLATES_SEED.find(
        (t) => t.slug === slugOrId || t.id === slugOrId,
      );
      if (seed) return seed as MarketplaceTemplate;
      throw new NotFoundException(`Template '${slugOrId}' not found`);
    }

    return template;
  }

  /**
   * 1-Click Launch: Deploy a golden marketplace template into an active, secure sandbox
   */
  async launchTemplate(
    slugOrId: string,
    dto: LaunchTemplateDto,
  ): Promise<{ sandbox: Sandbox; template: MarketplaceTemplate }> {
    const template = await this.findOne(slugOrId);
    this.logger.log(`🚀 Launching template '${template.name}' for sandbox '${dto.name}'...`);

    // Map template ports to sandbox port map
    const portsMap: Record<string, string> = {};
    if (template.ports) {
      for (const p of template.ports) {
        portsMap[String(p.port)] = String(p.port);
      }
    }

    // Merge default and user env vars
    const finalEnv: Record<string, string> = {};
    if (template.envVars) {
      for (const env of template.envVars) {
        if (env.defaultValue) finalEnv[env.key] = env.defaultValue;
      }
    }
    if (dto.envVars) {
      Object.assign(finalEnv, dto.envVars);
    }

    // 1. Provision sandbox container
    const sandbox = await this.sandboxService.create(
      {
        name: dto.name,
        image: template.image,
        cpuLimit: dto.customCpu || template.defaultCpu,
        memoryLimit: dto.customMemory || template.defaultMemory,
        diskLimit: template.defaultDisk,
        ports: portsMap,
        envVars: finalEnv,
        description: `Deployed from Golden Template: ${template.name}`,
        labels: {
          'quarkbox.template.slug': template.slug,
          'quarkbox.template.name': template.name,
        },
      },
      dto.userId,
    );

    // 2. Inject Git Repository if specified
    if (dto.gitRepoUrl) {
      try {
        await this.contextService.injectGitRepo(sandbox.id, {
          repoUrl: dto.gitRepoUrl,
          branch: dto.gitBranch,
          targetDir: template.recommendedWorkdir || '/workspace',
        });
      } catch (err: any) {
        this.logger.warn(`Git auto-clone warning: ${err.message}`);
      }
    }

    // 3. Run Post-Launch Bootstrap Script in background
    if (template.postLaunchScript) {
      try {
        this.logger.log(`Executing post-launch bootstrap script for ${sandbox.name}...`);
        await this.sandboxService.exec(
          sandbox.id,
          template.postLaunchScript,
          template.recommendedWorkdir || '/workspace',
        );
      } catch (err: any) {
        this.logger.warn(`Post-launch script warning: ${err.message}`);
      }
    }

    // Increment template launch count
    template.launchesCount = (template.launchesCount || 0) + 1;
    await this.templateRepo.save(template).catch(() => null);

    await this.activityService.record({
      type: ActivityType.SANDBOX_CREATED,
      summary: `Launched Golden Template "${template.name}" (${template.slug})`,
      sandboxId: sandbox.id,
      userId: dto.userId,
      metadata: {
        templateSlug: template.slug,
        templateName: template.name,
        image: template.image,
      },
    });

    return { sandbox, template };
  }
}
