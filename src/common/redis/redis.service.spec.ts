import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
        if (key === 'REDIS_ENABLED') return false; // Disable real network connection in unit test
        return defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return null when getting a key if redis is disabled/disconnected', async () => {
    const res = await service.get('test-key');
    expect(res).toBeNull();
  });

  it('should return false for isHealthy when disconnected', () => {
    expect(service.isHealthy()).toBe(false);
  });

  it('should not throw error on set/del/flush operations when disconnected', async () => {
    await expect(service.set('key', { val: 123 }, 60)).resolves.not.toThrow();
    await expect(service.del('key')).resolves.not.toThrow();
    await expect(service.delByPattern('key:*')).resolves.not.toThrow();
    await expect(service.flushDb()).resolves.not.toThrow();
  });
});
