import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips unexpected fields
      forbidNonWhitelisted: true, // throws error if extra fields exist
      transform: true, // converts types automatically (string → boolean, string → number)
      forbidUnknownValues: true, // ensures DTO type is respected
    }),
  );

  app.enableCors(
    process.env.NODE_ENV === 'production'
      ? {
          origin: ['https://www.example.com'],
        }
      : {
          origin: '*',
        },
  );
  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
