import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import sharp from 'sharp';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface UploadedImageResult {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadsBasePath = path.join(process.cwd(), 'uploads', 'menus');

  constructor() {
    this.ensureUploadDirectory();
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadsBasePath)) {
      fs.mkdirSync(this.uploadsBasePath, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadsBasePath}`);
    }
  }

  async processAndSaveMenuImage(file: Express.Multer.File): Promise<UploadedImageResult> {
    if (!file) {
      throw new BadRequestException('File gambar tidak ditemukan.');
    }

    // 1. Validate MIME Type Whitelist
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException(
        `Format file tidak didukung (${file.mimetype}). Hanya format JPG, PNG, dan WebP yang diizinkan.`,
      );
    }

    // 2. Validate File Size
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Ukuran file melebihi batas maksimum 5 MB.');
    }

    try {
      // 3. Sharp Image Re-encoding, Sanitization, and Compression to WebP
      // Decode raw pixels, strip all EXIF/malicious payloads, and convert purely to WebP
      const sharpInstance = sharp(file.buffer)
        .rotate() // Auto-orient based on EXIF before stripping
        .resize({
          width: 1200,
          height: 1200,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 });

      const processedBuffer = await sharpInstance.toBuffer();
      const metadata = await sharp(processedBuffer).metadata();

      // 4. Generate Random Safe UUID Filename
      const uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const timestamp = Date.now();
      const filename = `menu-${timestamp}-${uniqueId}.webp`;
      const targetFilePath = path.join(this.uploadsBasePath, filename);

      // 5. Save to Disk
      await fs.promises.writeFile(targetFilePath, processedBuffer);

      this.logger.log({
        action: 'IMAGE_UPLOAD_SUCCESS',
        filename,
        originalSize: file.size,
        compressedSize: processedBuffer.length,
        reductionPercent: Math.round((1 - processedBuffer.length / file.size) * 100),
      });

      // 6. Return Public Accessible URL path
      const publicUrl = `/uploads/menus/${filename}`;

      return {
        url: publicUrl,
        filename,
        size: processedBuffer.length,
        mimeType: 'image/webp',
        width: metadata.width,
        height: metadata.height,
      };
    } catch (err: any) {
      this.logger.error(`Gagal memproses gambar: ${err.message}`, err.stack);
      throw new BadRequestException(
        'Berkas yang diunggah bukan file gambar valid atau rusak.',
      );
    }
  }
}
