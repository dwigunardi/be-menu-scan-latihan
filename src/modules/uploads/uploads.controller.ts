import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UploadsService, UploadedImageResult } from './uploads.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Uploads')
@ApiBearerAuth()
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Upload dan sanitasi foto menu (Konversi otomatis ke WebP)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Foto berhasil diunggah dan dikompresi' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadMenuImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadedImageResult> {
    if (!file) {
      throw new BadRequestException('Pilih file gambar untuk diunggah.');
    }
    return this.uploadsService.processAndSaveMenuImage(file);
  }
}
