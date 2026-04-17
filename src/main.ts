import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as oracledb from 'oracledb';

oracledb.initOracleClient({
  libDir: 'C:\\oracle\\instantclient_19_11'
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1/production');

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-WebServiceUTSAPI-Key', 'Host'],
  });

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on port ${port}`);
}
bootstrap();
