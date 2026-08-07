import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('PostgreSQL Database connected via Prisma Client.', { step: 'DATABASE_CONNECTED' });

    // Slow Query Monitoring Extension (Threshold: 500ms)
    // @ts-expect-error Prisma client query event type binding
    this.$on('query', (e: { query: string; params: string; duration: number }) => {
      if (e.duration > 500) {
        this.logger.warn({
          step: 'DATABASE_QUERY',
          query: e.query,
          params: e.params,
          durationMs: e.duration,
          msg: `SLOW QUERY DETECTED: Prisma Query took ${e.duration}ms`,
        });
      }
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('PostgreSQL Database connection closed.', { step: 'DATABASE_DISCONNECTED' });
  }
}
