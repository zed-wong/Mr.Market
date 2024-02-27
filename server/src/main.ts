import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const dev = true;
  if (dev) {
    const app = await NestFactory.create(AppModule);
    app.enableCors({
      origin: 'http://localhost:3000',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });

    // Global request logging
    app.use((req, res, next) => {
      console.log(`Incoming request: ${req.method} ${req.url}`);
      next();
    });

    const config = new DocumentBuilder()
      .setTitle('Mixin Doc backend API')
      .setDescription('Mixin Doc backend to execute trades and strategies')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    await app.listen(3000);
  } else {
    const httpsOptions = {
      key: fs.readFileSync(
        '/etc/letsencrypt/live/bc6e1fa0-3c5a-4235-809c-c4fcc4a5d859.mvg.fi/privkey.pem',
      ),
      cert: fs.readFileSync(
        '/etc/letsencrypt/live/bc6e1fa0-3c5a-4235-809c-c4fcc4a5d859.mvg.fi/fullchain.pem',
      ),
    };
    const app = await NestFactory.create(AppModule, { httpsOptions });
    app.enableCors();

    // Global request logging
    app.use((req, res, next) => {
      console.log(`Incoming request: ${req.method} ${req.url}`);
      next();
    });

    const config = new DocumentBuilder()
      .setTitle('Mixin Doc backend API')
      .setDescription('Mixin Doc backend to execute trades and strategies')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    await app.listen(3000);
  }
}
bootstrap();
