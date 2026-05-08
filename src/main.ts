import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import express, { Request, Response } from 'express';

// ── Local development bootstrap (WebSocket-enabled) ───────────────────────────
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useWebSocketAdapter(new IoAdapter(app));
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 5000);
}

// ── Vercel serverless handler ─────────────────────────────────────────────────
// WebSockets are not supported in Vercel's serverless environment.
// For production with WebSocket support, deploy to a long-running server
// (e.g. Railway, Render, or a VPS).

const server = express();

const createNestServer = async (expressInstance: express.Express) => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
    { rawBody: true },
  );

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

  await app.init();
};

let isServerReady = false;

export default async function handler(req: Request, res: Response) {
  if (!isServerReady) {
    await createNestServer(server);
    isServerReady = true;
  }
  server(req, res);
}

// Run local bootstrap when not in Vercel serverless
if (!process.env.VERCEL) {
  bootstrap();
}
