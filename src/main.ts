import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { EncryptPayloadInterceptor } from './common/interceptors/encrypt-payload.interceptor';
import { EcdhService } from './common/crypto/ecdh.service';
import { CryptoService } from './common/crypto/crypto.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Pino Logger Setup
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.PORT') || 3000;
  const frontendUrl = configService.get<string>('app.FRONTEND_URL') || 'http://localhost:3000';

  // Serve static uploaded assets securely with nosniff header
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  // Global Prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['api/docs', 'health', 'uploads/(.*)'],
  });

  // Enable CORS
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'x-handshake-token',
      'X-Requested-With',
    ],
  });

  // Global Zod Validation Pipe
  app.useGlobalPipes(new ZodValidationPipe());

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global Interceptors
  const reflector = app.get(Reflector);
  const ecdhService = app.get(EcdhService);
  const cryptoService = app.get(CryptoService);

  app.useGlobalInterceptors(
    new TransformInterceptor(reflector),
    new EncryptPayloadInterceptor(reflector, ecdhService, cryptoService),
  );

  // Swagger Documentation Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MenuScan API Documentation 🍽️📱')
    .setDescription('Digital QR Code Menu System Backend API (NestJS + PostgreSQL + Prisma + Zod + AES-256-GCM Payload Encryption)')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-handshake-token',
        in: 'header',
        description: 'Session handshake token returned from /api/v1/auth/handshake',
      },
      'x-handshake-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  console.log(`🚀 MenuScan Server running on http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger OpenAPI documentation available on http://localhost:${port}/api/docs`);
}
bootstrap();
