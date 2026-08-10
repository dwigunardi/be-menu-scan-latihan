import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: jest.Mocked<PaymentsService>;

  beforeEach(async () => {
    const mockService = {
      createQris: jest.fn(),
      handleWebhook: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
    service = module.get(PaymentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call service.createQris', async () => {
    const dto = { orderId: 'order-1' };
    const expected = { orderId: 'order-1', qrisString: 'qris...' } as any;
    service.createQris.mockResolvedValue(expected);

    const result = await controller.createQris(dto);
    expect(result).toEqual(expected);
    expect(service.createQris).toHaveBeenCalledWith(dto);
  });

  it('should call service.handleWebhook', async () => {
    const dto = {
      orderId: 'order-1',
      orderNumber: 'ORD-001',
      transactionStatus: 'SETTLEMENT' as const,
      grossAmount: 50000,
      paymentType: 'QRIS' as const,
      signatureKey: 'sig-key',
    };
    const expected = { success: true, status: 'PAID' } as any;
    service.handleWebhook.mockResolvedValue(expected);

    const result = await controller.handleWebhook(dto);
    expect(result).toEqual(expected);
    expect(service.handleWebhook).toHaveBeenCalledWith(dto);
  });
});
