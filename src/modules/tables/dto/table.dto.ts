import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateTableSchema = z.object({
  number: z.string().min(1, 'Table number is required (e.g. Meja 01)'),
});

export class CreateTableDto extends createZodDto(CreateTableSchema) {}

export const TableSessionSchema = z.object({
  customerName: z.string().min(2, 'Customer name must be at least 2 characters'),
});

export class TableSessionDto extends createZodDto(TableSessionSchema) {}
