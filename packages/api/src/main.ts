import './tracing';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // This Nest version doesn't auto-detect a WebSocket driver — without this,
  // TerminalGateway (socket.io-based) fails to bind at listen time.
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  });

  // Security headers
  app.use(helmet());

  // Swagger / OpenAPI
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('QuarkBox API')
      .setDescription(
        'Secure, elastic cloud sandbox platform for AI agents and developers',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .addTag('sandboxes', 'Sandbox lifecycle management')
      .addTag('auth', 'Authentication & authorization')
      .addTag('health', 'Health checks')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    try {
      const outPath = path.resolve(__dirname, '..', 'openapi.json');
      fs.writeFileSync(outPath, JSON.stringify(document, null, 2));
      logger.log(`OpenAPI spec written to ${outPath}`);
    } catch (err) {
      logger.warn(`Failed to write openapi.json: ${err}`);
    }
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`QuarkBox API listening on port ${port} [${process.env.NODE_ENV || 'development'}]`);
  logger.log(`REST API:    http://localhost:${port}/api`);
  logger.log(`Swagger UI:  http://localhost:${port}/api/docs`);

  const shutdown = async () => {
    logger.log('Shutdown signal received, closing application...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
bootstrap();
