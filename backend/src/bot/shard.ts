import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { Logger } from 'nestjs-pino';
import { BotModule } from './bot.module';
import { APP_CONFIG, AppConfig } from '../core/config';

/** Runs inside every shard process spawned by manager.ts. */
async function bootstrap() {
  process.env.DEXBOTX_PROCESS_ROLE = `shard${process.env.SHARD_ID ?? '0'}`;
  const app = await NestFactory.createApplicationContext(BotModule, { bufferLogs: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.sentryDsn) Sentry.init({ dsn: config.sentryDsn, environment: config.nodeEnv, tracesSampleRate: 0 });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
