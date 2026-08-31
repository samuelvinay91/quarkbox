import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // Swagger / OpenAPI
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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║          ⚛️  QuarkBox API Server              ║
  ║                                               ║
  ║   REST API:    http://localhost:${port}/api      ║
  ║   Swagger UI:  http://localhost:${port}/api/docs ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}                  ║
  ╚═══════════════════════════════════════════════╝
  `);
}
bootstrap();
