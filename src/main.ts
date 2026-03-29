import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

// Cache the Express instance so Vercel doesn't cold-start NestJS on every single request
let cachedServer: any;

async function bootstrap() {
  if (cachedServer) {
    return cachedServer;
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  app.enableCors(
    process.env.NODE_ENV === 'production'
      ? {
          origin: process.env.ALLOWED_ORIGIN,
          credentials: true,
        }
      : {
          origin: 'http://localhost:3000',
          credentials: true,
        },
  );

  // Initialize the app without binding to a port
  await app.init();

  // Extract the underlying Express instance
  cachedServer = app.getHttpAdapter().getInstance();
  return cachedServer;
}

// Vercel expects a default export function to handle incoming requests
export default async function handler(req: any, res: any) {
  const server = await bootstrap();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return server(req, res);
}
