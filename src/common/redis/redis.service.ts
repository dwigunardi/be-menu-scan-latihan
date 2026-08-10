import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const rawEnabled = this.configService.get('REDIS_ENABLED');
    const isEnabled = rawEnabled === true || rawEnabled === 'true' || rawEnabled === 1;
    if (!isEnabled) {
      this.logger.log({
        step: 'REDIS_INIT',
        msg: 'Redis is disabled via REDIS_ENABLED=false config (Operating in in-memory mode)',
      });
      return;
    }

    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD', '');
    const db = this.configService.get<number>('REDIS_DB', 0);

    try {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        retryStrategy: (times) => {
          if (times > 5) {
            this.logger.warn({
              step: 'REDIS_RETRY_LIMIT',
              times,
              msg: 'Redis connection retry limit reached. Continuing in memory-only fallback mode.',
            });
            return null; // Stop retrying
          }
          const delay = Math.min(times * 1000, 5000);
          return delay;
        },
        lazyConnect: false,
        maxRetriesPerRequest: 1,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log({
          step: 'REDIS_CONNECTED',
          host,
          port,
          db,
          msg: `Redis connected successfully on ${host}:${port} (DB: ${db})`,
        });
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn({
          step: 'REDIS_ERROR',
          error: err.message,
          msg: 'Redis encountered an error. System operating with fallback.',
        });
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.log({
          step: 'REDIS_CLOSED',
          msg: 'Redis connection closed',
        });
      });
    } catch (error: any) {
      this.logger.warn({
        step: 'REDIS_INIT_FAILED',
        error: error.message,
        msg: 'Failed to initialize Redis client',
      });
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      this.logger.log({
        step: 'REDIS_DESTROYED',
        msg: 'Redis client disconnected gracefully',
      });
    }
  }

  /**
   * Check if Redis is currently connected
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null && this.client.status === 'ready';
  }

  /**
   * Get raw ioredis instance
   */
  getClient(): Redis | null {
    return this.client;
  }

  /**
   * Get value by key with auto JSON deserialization
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error: any) {
      this.logger.warn({
        step: 'REDIS_GET_ERROR',
        key,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Set key value with auto JSON serialization and optional TTL (seconds)
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      const stringValue = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, stringValue, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, stringValue);
      }
    } catch (error: any) {
      this.logger.warn({
        step: 'REDIS_SET_ERROR',
        key,
        error: error.message,
      });
    }
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error: any) {
      this.logger.warn({
        step: 'REDIS_DEL_ERROR',
        key,
        error: error.message,
      });
    }
  }

  /**
   * Delete multiple keys matching a pattern (e.g. "menuscan:cache:menus:*")
   */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        this.logger.log({
          step: 'REDIS_CACHE_INVALIDATED',
          pattern,
          keysDeleted: keys.length,
          msg: `Invalidated ${keys.length} cache keys matching pattern: ${pattern}`,
        });
      }
    } catch (error: any) {
      this.logger.warn({
        step: 'REDIS_DEL_PATTERN_ERROR',
        pattern,
        error: error.message,
      });
    }
  }

  /**
   * Flush current database
   */
  async flushDb(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    try {
      await this.client.flushdb();
      this.logger.log({
        step: 'REDIS_FLUSHDB',
        msg: 'Redis database flushed successfully',
      });
    } catch (error: any) {
      this.logger.warn({
        step: 'REDIS_FLUSH_ERROR',
        error: error.message,
      });
    }
  }
}
