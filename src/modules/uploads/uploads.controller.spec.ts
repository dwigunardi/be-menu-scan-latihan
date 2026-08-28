import { Test, TestingModule } from '@nestjs/testing';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { BadRequestException } from '@nestjs/common';

describe('UploadsController', () => {
  let controller: UploadsController;
  let service: any;

  beforeEach(async () => {
    service = {
      processAndSaveMenuImage: jest.fn().mockResolvedValue({
        url: '/uploads/menus/menu-123.webp',
        filename: 'menu-123.webp',
        size: 10240,
        mimeType: 'image/webp',
        width: 800,
        height: 600,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: service }],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadMenuImage', () => {
    it('should throw BadRequestException if file is missing', async () => {
      await expect(controller.uploadMenuImage(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should call uploadsService.processAndSaveMenuImage when file is provided', async () => {
      const mockFile: any = {
        mimetype: 'image/jpeg',
        size: 2048,
        buffer: Buffer.from('test image buffer'),
      };

      const result = await controller.uploadMenuImage(mockFile);
      expect(service.processAndSaveMenuImage).toHaveBeenCalledWith(mockFile);
      expect(result.url).toBe('/uploads/menus/menu-123.webp');
    });
  });
});
