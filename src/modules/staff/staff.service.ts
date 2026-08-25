import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateStaffDto,
  UpdateStaffDto,
  UpdateStaffPinDto,
  StaffQueryDto,
} from './dto/staff.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: StaffQueryDto) {
    const { page = 1, limit = 10, search, role, isActive } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (search && search.trim()) {
      const s = search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [totalItems, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          pinCode: true,
          dailyShiftHours: true,
          isActive: true,
          avatarUrl: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          joinedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    const items = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      pinCodeSet: Boolean(u.pinCode),
      dailyShiftHours: u.dailyShiftHours,
      isActive: u.isActive,
      avatarUrl: u.avatarUrl,
      isEmailVerified: u.isEmailVerified,
      isPhoneVerified: u.isPhoneVerified,
      joinedAt: u.joinedAt.toISOString(),
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        pinCode: true,
        dailyShiftHours: true,
        isActive: true,
        avatarUrl: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        joinedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Karyawan dengan ID ${id} tidak ditemukan`);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      pinCodeSet: Boolean(user.pinCode),
      dailyShiftHours: user.dailyShiftHours,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      joinedAt: user.joinedAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateStaffDto) {
    // Check duplicate email
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException(`Email ${dto.email} sudah terdaftar`);
    }

    // Check duplicate phone if supplied
    if (dto.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: dto.phone, deletedAt: null },
      });
      if (existingPhone) {
        throw new ConflictException(`Nomor WhatsApp ${dto.phone} sudah terdaftar`);
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const hashedPin = dto.pinCode ? await bcrypt.hash(dto.pinCode, 10) : null;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone || null,
        role: dto.role,
        password: hashedPassword,
        pinCode: hashedPin,
        dailyShiftHours: dto.dailyShiftHours || 8,
        isActive: true,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      pinCodeSet: Boolean(user.pinCode),
      dailyShiftHours: user.dailyShiftHours,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      joinedAt: user.joinedAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async update(id: string, dto: UpdateStaffDto) {
    await this.findById(id);

    if (dto.email) {
      const duplicateEmail = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (duplicateEmail) {
        throw new ConflictException(`Email ${dto.email} sudah digunakan oleh karyawan lain`);
      }
    }

    if (dto.phone) {
      const duplicatePhone = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id }, deletedAt: null },
      });
      if (duplicatePhone) {
        throw new ConflictException(`Nomor WhatsApp ${dto.phone} sudah digunakan oleh karyawan lain`);
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.dailyShiftHours !== undefined ? { dailyShiftHours: dto.dailyShiftHours } : {}),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      pinCodeSet: Boolean(updated.pinCode),
      dailyShiftHours: updated.dailyShiftHours,
      isActive: updated.isActive,
      avatarUrl: updated.avatarUrl,
      isEmailVerified: updated.isEmailVerified,
      isPhoneVerified: updated.isPhoneVerified,
      joinedAt: updated.joinedAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async updatePin(id: string, dto: UpdateStaffPinDto) {
    await this.findById(id);

    const hashedPin = await bcrypt.hash(dto.pinCode, 10);
    await this.prisma.user.update({
      where: { id },
      data: { pinCode: hashedPin },
    });

    return {
      success: true,
      message: 'PIN 4-digit karyawan berhasil diperbarui',
    };
  }

  async remove(id: string) {
    await this.findById(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return {
      success: true,
      message: 'Akun karyawan berhasil dinonaktifkan',
    };
  }
}
