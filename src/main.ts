import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
