import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadsService],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processAndSaveMenuImage', () => {
    it('should throw BadRequestException if file is null/undefined', async () => {
      await expect(service.processAndSaveMenuImage(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if mime type is invalid', async () => {
      const invalidFile: any = {
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('fake pdf data'),
      };

      await expect(service.processAndSaveMenuImage(invalidFile)).rejects.toThrow(
        /Format file tidak didukung/,
      );
    });

    it('should throw BadRequestException if file size exceeds 5MB', async () => {
      const oversizedFile: any = {
        mimetype: 'image/png',
        size: 6 * 1024 * 1024,
        buffer: Buffer.from('large image data'),
      };

      await expect(service.processAndSaveMenuImage(oversizedFile)).rejects.toThrow(
        /Ukuran file melebihi batas maksimum 5 MB/,
      );
    });

    it('should process and compress valid image buffer to WebP', async () => {
      // Create a small 10x10 PNG buffer with Sharp
      const validPngBuffer = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const validFile: any = {
        mimetype: 'image/png',
        size: validPngBuffer.length,
        buffer: validPngBuffer,
      };

      const result = await service.processAndSaveMenuImage(validFile);

      expect(result).toBeDefined();
      expect(result.url).toMatch(/^\/uploads\/menus\/menu-.*\.webp$/);
      expect(result.mimeType).toBe('image/webp');
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
      expect(result.size).toBeGreaterThan(0);
    });
  });
});
