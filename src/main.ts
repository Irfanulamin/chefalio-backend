import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
          origin: ['https://www.example.com'],
          credentials: true,
        }
      : {
          origin: 'http://localhost:3000',
          credentials: true,
        },
  );

  await app.listen(process.env.PORT ?? 5000);
}

bootstrap();
