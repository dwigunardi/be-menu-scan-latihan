import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

export const UserRoleEnum = z.enum(['ADMIN', 'CASHIER', 'KITCHEN', 'WAITER']);

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: UserRoleEnum.default('ADMIN'),
});

export class CreateUserDto extends createZodDto(CreateUserSchema) {}

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).optional(),
  role: UserRoleEnum.optional(),
  password: z.string().min(6).optional(),
});

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}

export const QueryUserSchema = PaginationQuerySchema.extend({
  role: UserRoleEnum.optional(),
  sortBy: z.enum(['name', 'email', 'role', 'createdAt']).default('createdAt').optional(),
});

export class QueryUserDto extends createZodDto(QueryUserSchema) {}
