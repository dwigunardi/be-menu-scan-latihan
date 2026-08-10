import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
    jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect on onModuleInit and register query event listener', async () => {
    let queryCallback: any;
    jest.spyOn(service, '$on' as any).mockImplementation((event: string, cb: any) => {
      if (event === 'query') {
        queryCallback = cb;
      }
    });

    await service.onModuleInit();
    expect(service.$connect).toHaveBeenCalled();
    expect(service.$on).toHaveBeenCalledWith('query', expect.any(Function));

    // Test slow query logging (>500ms)
    if (queryCallback) {
      // should handle fast query without throwing
      queryCallback({ query: 'SELECT 1', params: '[]', duration: 50 });
      // should handle slow query
      queryCallback({ query: 'SELECT * FROM menu_items', params: '[]', duration: 600 });
    }
  });

  it('should disconnect on onModuleDestroy', async () => {
    await service.onModuleDestroy();
    expect(service.$disconnect).toHaveBeenCalled();
  });
});
