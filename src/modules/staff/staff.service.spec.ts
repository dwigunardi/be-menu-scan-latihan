import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '@prisma/client';

describe('StaffService', () => {
  let service: StaffService;
  let prisma: {
    user: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const mockUser = {
    id: 'user-123',
    name: 'Ahmad Syahripudin',
    email: 'ahmad@kumpulcafe.com',
    phone: '+6281234567890',
    role: UserRole.KITCHEN,
    pinCode: '$2b$10$hashedpin',
    dailyShiftHours: 8,
    isActive: true,
    avatarUrl: null,
    isEmailVerified: true,
    isPhoneVerified: false,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([mockUser]),
        findFirst: jest.fn().mockImplementation((args) => {
          if (args?.where?.id) return Promise.resolve(mockUser);
          return Promise.resolve(null);
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockUser),
        update: jest.fn().mockResolvedValue(mockUser),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return paginated staff items', async () => {
    const result = await service.findAll({ page: 1, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Ahmad Syahripudin');
    expect(result.items[0].pinCodeSet).toBe(true);
    expect(result.meta.totalItems).toBe(1);
  });

  it('findById should return a single staff member', async () => {
    const result = await service.findById('user-123');
    expect(result.id).toBe('user-123');
    expect(result.email).toBe('ahmad@kumpulcafe.com');
  });

  it('create should hash password and pin and create user in DB', async () => {
    const result = await service.create({
      name: 'Ahmad Syahripudin',
      email: 'ahmad@kumpulcafe.com',
      phone: '+6281234567890',
      role: UserRole.KITCHEN,
      password: 'password123',
      pinCode: '1234',
      dailyShiftHours: 8,
    });

    expect(prisma.user.create).toHaveBeenCalled();
    expect(result.name).toBe('Ahmad Syahripudin');
  });

  it('updatePin should update staff hashed pin', async () => {
    const result = await service.updatePin('user-123', { pinCode: '4321' });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('remove should soft delete staff', async () => {
    const result = await service.remove('user-123');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-123' },
        data: expect.objectContaining({ isActive: false }),
      })
    );
    expect(result.success).toBe(true);
  });
});
