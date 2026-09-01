import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, baseUrl, ip } = req;
    const start = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const { statusCode } = res;
      const userId = (req as any).user?.userId || 'anon';

      this.logger.log(
        `${method} ${baseUrl} ${statusCode} ${durationMs}ms user=${userId} ip=${ip}`,
      );
    });

    next();
  }
}
