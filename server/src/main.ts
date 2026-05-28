/* eslint-disable no-console */
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { SafeJsonExceptionFilter } from './common/filters/safe-json-exception.filter';
import { configureCorsOrigins } from './common/helpers/cors';
import * as encryption from './common/helpers/crypto';
import { CustomLogger } from './modules/infrastructure/logger/logger.service';

dotenv.config();

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.log('JWT_SECRET is not set. Generating a new one...');
    const secret = crypto.randomBytes(32).toString('hex');

    process.env.JWT_SECRET = secret;

    const envFile = '.env';

    try {
      if (fs.existsSync(envFile)) {
        fs.appendFileSync(envFile, `\nJWT_SECRET=${secret}\n`);
      } else {
        fs.writeFileSync(envFile, `JWT_SECRET=${secret}\n`);
      }
      console.log(`JWT_SECRET saved to ${envFile}`);
    } catch (err) {
      console.error('Failed to write JWT_SECRET to .env file', err);
    }
  }

  if (!process.env.ENCRYPTION_PRIVATE_KEY) {
    console.log('ENCRYPTION_PRIVATE_KEY is not set. Generating a new one...');
    const { privateKey } = encryption.generateKeyPair();

    process.env.ENCRYPTION_PRIVATE_KEY = privateKey;

    const envFile = '.env';

    try {
      if (fs.existsSync(envFile)) {
        fs.appendFileSync(envFile, `\nENCRYPTION_PRIVATE_KEY=${privateKey}\n`);
      } else {
        fs.writeFileSync(envFile, `ENCRYPTION_PRIVATE_KEY=${privateKey}\n`);
      }
      console.log(`ENCRYPTION_KEYS saved to ${envFile}`);
    } catch (err) {
      console.error('Failed to write ENCRYPTION_KEYS to .env file', err);
    }
  }
  const logger = new CustomLogger(AppModule.name);
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  CustomLogger.configureWebhooks({
    discordWebhookUrl: configService.get<string>('logger.discord_webhook_url'),
    mixinGroupWebhookUrl: configService.get<string>(
      'logger.mixin_group_webhook_url',
    ),
  });
  app.useGlobalFilters(new SafeJsonExceptionFilter());

  const allowedOrigins = configureCorsOrigins(
    configService.get<string>('cors.origin'),
    configService.get<boolean>('cors.allow_wildcard', false),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.use(helmet());

  // Global request logging
  app.use((req, _, next) => {
    logger.log(`Incoming request: ${req.method} ${req.url}`);
    next();
  });

  if (configService.get<boolean>('dev')) {
    const config = new DocumentBuilder()
      .setTitle('Mixin Doc backend API')
      .setDescription('Mixin Doc backend to execute trades and strategies')
      .setVersion('1.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT', // Optional, but helps with proper documentation
      })
      .build();
    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<string>('port', '3000');

  await app.listen(port);
}

try {
  bootstrap();
} catch (error) {
  console.error(error);
}
