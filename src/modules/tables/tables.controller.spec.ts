import { Test, TestingModule } from '@nestjs/testing';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

describe('TablesController', () => {
  let controller: TablesController;
  let tablesService: jest.Mocked<TablesService>;

  beforeEach(async () => {
    const mockTablesService = {
      getTableStatus: jest.fn(),
      initSession: jest.fn(),
      findAllAdmin: jest.fn(),
      create: jest.fn(),
      resetTable: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        { provide: TablesService, useValue: mockTablesService },
      ],
    }).compile();

    controller = module.get<TablesController>(TablesController);
    tablesService = module.get(TablesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTableStatus', () => {
    it('should return table status from service', async () => {
      const tableStatus = { number: '01', status: 'VACANT', activeCustomerName: null };
      tablesService.getTableStatus.mockResolvedValue(tableStatus as any);

      const result = await controller.getTableStatus('01');
      expect(result).toEqual(tableStatus);
      expect(tablesService.getTableStatus).toHaveBeenCalledWith('01');
    });
  });

  describe('initTableSession', () => {
    it('should initialize table session with customer name', async () => {
      const dto = { customerName: 'Dwi Gunardi' };
      const tableSession = { number: '01', status: 'OCCUPIED', activeCustomerName: 'Dwi Gunardi' };
      tablesService.initSession.mockResolvedValue(tableSession as any);

      const result = await controller.initTableSession('01', dto);
      expect(result).toEqual(tableSession);
      expect(tablesService.initSession).toHaveBeenCalledWith('01', dto);
    });
  });

  describe('findAllAdmin', () => {
    it('should return all tables for admin monitor', async () => {
      const tables = [{ id: 't1', number: '01', status: 'VACANT' }];
      tablesService.findAllAdmin.mockResolvedValue(tables as any);

      const result = await controller.findAllAdmin({});
      expect(result).toEqual(tables);
      expect(tablesService.findAllAdmin).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create new table and return created record', async () => {
      const dto = { number: 'Meja 11' };
      const created = { id: 't11', number: 'Meja 11', status: 'VACANT' };
      tablesService.create.mockResolvedValue(created as any);

      const result = await controller.create(dto);
      expect(result).toEqual(created);
      expect(tablesService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetTable', () => {
    it('should reset table session to VACANT', async () => {
      const resetTable = { id: 't1', number: '01', status: 'VACANT', activeCustomerName: null };
      tablesService.resetTable.mockResolvedValue(resetTable as any);

      const result = await controller.resetTable('t1');
      expect(result).toEqual(resetTable);
      expect(tablesService.resetTable).toHaveBeenCalledWith('t1');
    });
  });

  describe('remove', () => {
    it('should delete table and return confirmation message', async () => {
      const response = { success: true, message: 'Table t1 deleted successfully' };
      tablesService.remove.mockResolvedValue(response as any);

      const result = await controller.remove('t1');
      expect(result).toEqual(response);
      expect(tablesService.remove).toHaveBeenCalledWith('t1');
    });
  });
});
