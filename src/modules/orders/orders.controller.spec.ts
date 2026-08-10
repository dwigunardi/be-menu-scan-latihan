import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<OrdersService>;

  beforeEach(async () => {
    const mockOrdersService = {
      create: jest.fn(),
      findByOrderNumber: jest.fn(),
      findAllAdmin: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    ordersService = module.get(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createOrder', () => {
    it('should place order and return created order detail', async () => {
      const dto = {
        tableNumber: '01',
        customerName: 'Dwi',
        items: [{ menuItemId: 'm1', quantity: 2 }],
      };
      const createdOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-20260810-001',
        status: 'PENDING',
        totalAmount: 50000,
      };

      ordersService.create.mockResolvedValue(createdOrder as any);

      const result = await controller.createOrder(dto as any);
      expect(result).toEqual(createdOrder);
      expect(ordersService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('getOrderByNumber', () => {
    it('should return order details by orderNumber', async () => {
      const order = { id: 'ord-1', orderNumber: 'ORD-20260810-001', status: 'PENDING' };
      ordersService.findByOrderNumber.mockResolvedValue(order as any);

      const result = await controller.getOrderByNumber('ORD-20260810-001');
      expect(result).toEqual(order);
      expect(ordersService.findByOrderNumber).toHaveBeenCalledWith('ORD-20260810-001');
    });
  });

  describe('getAdminOrders', () => {
    it('should return live orders list for admin query', async () => {
      const query = { status: 'PENDING' as any, page: 1, limit: 10 };
      const orders = {
        data: [{ id: 'ord-1', orderNumber: 'ORD-001', status: 'PENDING' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      ordersService.findAllAdmin.mockResolvedValue(orders as any);

      const result = await controller.getAdminOrders(query);
      expect(result).toEqual(orders);
      expect(ordersService.findAllAdmin).toHaveBeenCalledWith(query);
    });
  });

  describe('updateOrderStatus', () => {
    it('should update status and return updated order', async () => {
      const dto = { status: 'PREPARING' as any };
      const updated = { id: 'ord-1', status: 'PREPARING' };
      ordersService.updateStatus.mockResolvedValue(updated as any);

      const result = await controller.updateOrderStatus('ord-1', dto);
      expect(result).toEqual(updated);
      expect(ordersService.updateStatus).toHaveBeenCalledWith('ord-1', dto);
    });
  });
});
