import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('ShiftsController', () => {
  let controller: ShiftsController;

  const mockShiftsService = {
    getCurrentShift: jest.fn(),
    openShift: jest.fn(),
    closeShift: jest.fn(),
    getShiftHistory: jest.fn(),
  };

  const user = { id: 'cashier-1', role: UserRole.CASHIER, name: 'Dendi' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShiftsController],
      providers: [{ provide: ShiftsService, useValue: mockShiftsService }],
    }).compile();

    controller = module.get<ShiftsController>(ShiftsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('restricts the whole controller to ADMIN and CASHIER', () => {
    const roles = new Reflector().get<UserRole[]>(ROLES_KEY, ShiftsController);
    expect(roles).toEqual([UserRole.ADMIN, UserRole.CASHIER]);
  });

  it('getCurrentShift delegates to service (null when no open shift)', async () => {
    mockShiftsService.getCurrentShift.mockResolvedValue(null);
    await expect(controller.getCurrentShift()).resolves.toBeNull();
  });

  it('openShift passes payload and current user', async () => {
    const dto = { openingCash: 200000, notes: 'Modal pagi' };
    mockShiftsService.openShift.mockResolvedValue({
      id: 's-1',
      status: 'OPEN',
    });

    await controller.openShift(dto, user);

    expect(mockShiftsService.openShift).toHaveBeenCalledWith(dto, user);
  });

  it('closeShift passes id, payload and current user', async () => {
    const dto = { actualCash: 350000 };
    mockShiftsService.closeShift.mockResolvedValue({
      id: 's-1',
      status: 'CLOSED',
    });

    await controller.closeShift('s-1', dto, user);

    expect(mockShiftsService.closeShift).toHaveBeenCalledWith('s-1', dto, user);
  });

  it('getShiftHistory forwards the query', async () => {
    const query = { page: 1, limit: 10, status: 'CLOSED' as const };
    mockShiftsService.getShiftHistory.mockResolvedValue({
      items: [],
      meta: {},
    });

    await controller.getShiftHistory(query);

    expect(mockShiftsService.getShiftHistory).toHaveBeenCalledWith(query);
  });
});
