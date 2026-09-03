import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { SandboxService } from '../sandbox/sandbox.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.entity';
import {
  NavigateDto,
  ScreenshotDto,
  ClickDto,
  ExtractContentDto,
  EvaluateScriptDto,
} from './dto';

@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly activityService: ActivityService,
  ) {}

  private async ensureBrowserRunning(sandboxId: string, userId?: string) {
    const checkPlaywright = `node -e "require('playwright')"`;
    const resPw = await this.sandboxService.exec(sandboxId, checkPlaywright, '/tmp', userId);
    if (resPw.exitCode !== 0) {
      this.logger.log(`Playwright not found in sandbox ${sandboxId}, installing...`);
      await this.sandboxService.exec(sandboxId, 'npm init -y', '/tmp', userId);
      await this.sandboxService.exec(sandboxId, 'npm install playwright', '/tmp', userId);
      await this.sandboxService.exec(sandboxId, 'npx playwright install chromium --with-deps', '/tmp', userId);
    }

    const checkPort = `curl -s http://127.0.0.1:9222/json`;
    const resPort = await this.sandboxService.exec(sandboxId, checkPort, '/tmp', userId);
    if (resPort.exitCode !== 0) {
      this.logger.log(`Starting background browser on sandbox ${sandboxId}`);
      
      const script = `
        const { chromium } = require('playwright');
        (async () => {
          const browserServer = await chromium.launchServer({ port: 9222, headless: true });
          console.log('WS Endpoint:', browserServer.wsEndpoint());
        })();
      `;
      const b64 = Buffer.from(script).toString('base64');
      const startCmd = `echo "${b64}" | base64 -d > /tmp/start_browser.js && nohup node /tmp/start_browser.js > /tmp/browser.log 2>&1 &`;
      await this.sandboxService.exec(sandboxId, startCmd, '/tmp', userId);
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  private async executeNodeScript(sandboxId: string, scriptContent: string, userId?: string): Promise<any> {
    await this.ensureBrowserRunning(sandboxId, userId);

    const b64 = Buffer.from(scriptContent).toString('base64');
    const wrapper = `
      const fs = require('fs');
      const buf = Buffer.from('${b64}', 'base64');
      fs.writeFileSync('/tmp/browser_script.js', buf);
    `;

    await this.sandboxService.exec(sandboxId, `node -e "${wrapper.replace(/\n/g, '')}"`, '/tmp', userId);
    const result = await this.sandboxService.exec(sandboxId, 'node /tmp/browser_script.js', '/tmp', userId);

    if (result.exitCode !== 0) {
      this.logger.error(`Browser script failed: ${result.stderr} | stdout: ${result.stdout}`);
      throw new InternalServerErrorException(`Browser script failed: ${result.stderr}`);
    }

    try {
      const out = result.stdout.trim().split('\n').pop();
      return JSON.parse(out || '{}');
    } catch (e) {
      this.logger.error(`Failed to parse output: ${result.stdout}`);
      throw new InternalServerErrorException('Invalid output from browser script');
    }
  }

  private getBaseScript(innerCode: string) {
    return `
      const { chromium } = require('playwright');
      (async () => {
        let browser;
        try {
          browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
          const contexts = browser.contexts();
          const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
          const pages = context.pages();
          const page = pages.length > 0 ? pages[0] : await context.newPage();
          
          ${innerCode}
          
        } catch (err) {
          console.log(JSON.stringify({ error: err.message, stack: err.stack }));
          process.exit(1);
        } finally {
          if (browser) await browser.disconnect();
        }
      })();
    `;
  }

  async navigate(sandboxId: string, dto: NavigateDto, userId?: string) {
    const script = this.getBaseScript(`
      const response = await page.goto('${dto.url}', { timeout: ${dto.timeoutMs || 30000} });
      ${dto.waitForSelector ? `await page.waitForSelector('${dto.waitForSelector}');` : ''}
      console.log(JSON.stringify({ title: await page.title(), status: response ? response.status() : null, url: page.url() }));
    `);

    const result = await this.executeNodeScript(sandboxId, script, userId);
    await this.recordActivity(sandboxId, 'navigate', dto, userId);
    return result;
  }

  async takeScreenshot(sandboxId: string, dto: ScreenshotDto, userId?: string) {
    const format = dto.format || 'png';
    const qualityProp = (format === 'jpeg' && dto.quality) ? `, quality: ${dto.quality}` : '';
    const script = this.getBaseScript(`
      const buffer = await page.screenshot({ fullPage: ${!!dto.fullPage}, type: '${format}'${qualityProp} });
      console.log(JSON.stringify({ base64: buffer.toString('base64'), format: '${format}' }));
    `);

    const result = await this.executeNodeScript(sandboxId, script, userId);
    await this.recordActivity(sandboxId, 'screenshot', dto, userId);
    return result;
  }

  async click(sandboxId: string, dto: ClickDto, userId?: string) {
    const selectorStr = Buffer.from(dto.selector).toString('base64');
    const script = this.getBaseScript(`
      const selector = Buffer.from('${selectorStr}', 'base64').toString('utf8');
      if (${dto.waitForNavigation ? 'true' : 'false'}) {
        const [response] = await Promise.all([page.waitForNavigation(), page.click(selector)]);
      } else {
        await page.click(selector);
      }
      console.log(JSON.stringify({ success: true, url: page.url() }));
    `);

    const result = await this.executeNodeScript(sandboxId, script, userId);
    await this.recordActivity(sandboxId, 'click', dto, userId);
    return result;
  }

  async extractContent(sandboxId: string, dto: ExtractContentDto, userId?: string) {
    const format = dto.format || 'html';
    const selectorStr = dto.selector ? Buffer.from(dto.selector).toString('base64') : '';
    const script = this.getBaseScript(`
      let content = '';
      const selector = '${selectorStr}' ? Buffer.from('${selectorStr}', 'base64').toString('utf8') : '';
      const target = selector ? page.locator(selector).first() : page.locator('body');
      
      const format = '${format}';
      if (format === 'html') {
        content = await target.innerHTML();
      } else if (format === 'text') {
        content = await target.innerText();
      } else {
        content = await target.innerHTML();
      }
      console.log(JSON.stringify({ content }));
    `);

    const result = await this.executeNodeScript(sandboxId, script, userId);
    await this.recordActivity(sandboxId, 'extract', dto, userId);
    return result;
  }

  async evaluate(sandboxId: string, dto: EvaluateScriptDto, userId?: string) {
    const scriptB64 = Buffer.from(dto.script).toString('base64');
    const script = this.getBaseScript(`
      const userScript = Buffer.from('${scriptB64}', 'base64').toString('utf8');
      const res = await page.evaluate(userScript);
      console.log(JSON.stringify({ result: res }));
    `);

    const result = await this.executeNodeScript(sandboxId, script, userId);
    await this.recordActivity(sandboxId, 'evaluate', dto, userId);
    return result;
  }

  private async recordActivity(sandboxId: string, action: string, dto: any, userId?: string) {
    await this.activityService.record({
      type: ActivityType.COMMAND_EXECUTED,
      summary: `Browser ${action} executed`,
      sandboxId,
      userId,
      metadata: { action, dto },
    });
  }
}
