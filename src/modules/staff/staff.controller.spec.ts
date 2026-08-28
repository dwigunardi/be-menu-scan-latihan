import { Test, TestingModule } from '@nestjs/testing';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { UserRole } from '@prisma/client';

describe('StaffController', () => {
  let controller: StaffController;
  let service: any;

  const mockStaff = {
    id: 'staff-1',
    name: 'Budi Kasir',
    email: 'budi@kumpul.cafe',
    phone: '+6281234567890',
    role: UserRole.CASHIER,
    isActive: true,
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({
        items: [mockStaff],
        meta: { page: 1, limit: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      }),
      findById: jest.fn().mockResolvedValue(mockStaff),
      create: jest.fn().mockResolvedValue(mockStaff),
      update: jest.fn().mockResolvedValue(mockStaff),
      updatePin: jest.fn().mockResolvedValue({ success: true, message: 'PIN presensi berhasil diperbarui' }),
      remove: jest.fn().mockResolvedValue({ success: true, message: 'Akun staf berhasil dinonaktifkan' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [{ provide: StaffService, useValue: service }],
    }).compile();

    controller = module.get<StaffController>(StaffController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated staff list', async () => {
      const query = { page: 1, limit: 10 };
      const result = await controller.findAll(query);
      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return single staff by id', async () => {
      const result = await controller.findById('staff-1');
      expect(service.findById).toHaveBeenCalledWith('staff-1');
      expect(result.id).toBe('staff-1');
    });
  });

  describe('create', () => {
    it('should create new staff', async () => {
      const dto = {
        name: 'Budi Kasir',
        email: 'budi@kumpul.cafe',
        phone: '+6281234567890',
        role: UserRole.CASHIER,
        pinCode: '1234',
      };
      const result = await controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result.name).toBe('Budi Kasir');
    });
  });

  describe('update', () => {
    it('should update staff profile', async () => {
      const dto = { name: 'Budi Senior Kasir' };
      const result = await controller.update('staff-1', dto);
      expect(service.update).toHaveBeenCalledWith('staff-1', dto);
      expect(result.id).toBe('staff-1');
    });
  });

  describe('updatePin', () => {
    it('should update staff PIN', async () => {
      const dto = { pinCode: '5678' };
      const result = await controller.updatePin('staff-1', dto);
      expect(service.updatePin).toHaveBeenCalledWith('staff-1', dto);
      expect(result.success).toBe(true);
    });
  });

  describe('remove', () => {
    it('should soft delete/deactivate staff', async () => {
      const result = await controller.remove('staff-1');
      expect(service.remove).toHaveBeenCalledWith('staff-1');
      expect(result.success).toBe(true);
    });
  });
});
