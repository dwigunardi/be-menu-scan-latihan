import { Test, TestingModule } from '@nestjs/testing';
import { TableZonesController } from './table-zones.controller';
import { TableZonesService } from './table-zones.service';

describe('TableZonesController', () => {
  let controller: TableZonesController;
  let service: any;

  const mockZone = {
    id: 'zone-1',
    name: 'Indoor VIP',
    color: 'emerald',
    sortOrder: 1,
    tableCount: 4,
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([mockZone]),
      findOne: jest.fn().mockResolvedValue(mockZone),
      create: jest.fn().mockResolvedValue(mockZone),
      update: jest.fn().mockResolvedValue(mockZone),
      remove: jest.fn().mockResolvedValue({ success: true, message: 'Table Zone deleted successfully' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TableZonesController],
      providers: [{ provide: TableZonesService, useValue: service }],
    }).compile();

    controller = module.get<TableZonesController>(TableZonesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all table zones', async () => {
      const result = await controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return table zone by id', async () => {
      const result = await controller.findOne('zone-1');
      expect(service.findOne).toHaveBeenCalledWith('zone-1');
      expect(result.id).toBe('zone-1');
    });
  });

  describe('create', () => {
    it('should create new table zone', async () => {
      const dto = { name: 'Indoor VIP', color: 'emerald', sortOrder: 1 };
      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result.name).toBe('Indoor VIP');
    });
  });

  describe('update', () => {
    it('should update table zone', async () => {
      const dto = { name: 'Indoor VIP Lounge' };
      const result = await controller.update('zone-1', dto);
      expect(service.update).toHaveBeenCalledWith('zone-1', dto);
      expect(result.id).toBe('zone-1');
    });
  });

  describe('remove', () => {
    it('should delete table zone', async () => {
      const result = await controller.remove('zone-1');
      expect(service.remove).toHaveBeenCalledWith('zone-1');
      expect(result.success).toBe(true);
    });
  });
});
