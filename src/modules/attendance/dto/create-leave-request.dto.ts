import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateLeaveRequestSchema = z.object({
  staffId: z.string().min(1, 'Pilih nama staf'),
  leaveType: z.enum(['SICK', 'ANNUAL_LEAVE', 'URGENT_MATTER', 'OTHER'], {
    message: 'Kategori izin tidak valid',
  }),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'),
  endDate: z.string().min(1, 'Tanggal selesai wajib diisi'),
  reason: z.string().min(3, 'Alasan izin minimal 3 karakter'),
});

export class CreateLeaveRequestDto extends createZodDto(CreateLeaveRequestSchema) {}
