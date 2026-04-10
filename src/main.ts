import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express, { Request, Response } from 'express';

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

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule, { rawBody: true });

//   app.use(cookieParser());

//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//       forbidUnknownValues: true,
//     }),
//   );

//   app.enableCors({
//     origin: 'http://localhost:3000',
//     credentials: true,
//   });

//   await app.listen(5000);
// }
// bootstrap();
