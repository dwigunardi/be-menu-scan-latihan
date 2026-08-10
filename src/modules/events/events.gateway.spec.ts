import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockSocket: any;
  let mockServer: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);

    mockSocket = {
      id: 'socket-123',
      join: jest.fn(),
      emit: jest.fn(),
    };

    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    gateway.server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should handle ping and emit pong', () => {
    gateway.handlePing(mockSocket);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'pong',
      expect.objectContaining({ status: 'OK' }),
    );
  });

  it('should handle join:kitchen', () => {
    const res = gateway.handleJoinKitchen(mockSocket);
    expect(mockSocket.join).toHaveBeenCalledWith('room:kitchen');
    expect(res.success).toBe(true);
  });

  it('should handle join:waiter', () => {
    const res = gateway.handleJoinWaiter(mockSocket);
    expect(mockSocket.join).toHaveBeenCalledWith('room:waiter');
    expect(res.success).toBe(true);
  });

  it('should handle join:cashier', () => {
    const res = gateway.handleJoinCashier(mockSocket);
    expect(mockSocket.join).toHaveBeenCalledWith('room:cashier');
    expect(res.success).toBe(true);
  });

  it('should handle join:table', () => {
    const res = gateway.handleJoinTable(mockSocket, { tableNumber: 'Meja 01' });
    expect(mockSocket.join).toHaveBeenCalledWith('room:table:Meja 01');
    expect(res.success).toBe(true);
  });

  it('should emit new paid order to kitchen and cashier', () => {
    const order = { id: 'ord-1', orderNumber: 'ORD-001', totalAmount: 50000 };
    gateway.emitNewPaidOrder(order);

    expect(mockServer.to).toHaveBeenCalledWith('room:kitchen');
    expect(mockServer.to).toHaveBeenCalledWith('room:cashier');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'order:new',
      expect.objectContaining({ order }),
    );
  });

  it('should emit order status changed event', () => {
    const order = { id: 'ord-1', orderNumber: 'ORD-001', status: 'SERVED' };
    gateway.emitOrderStatusChanged(order, 'Meja 01');

    expect(mockServer.to).toHaveBeenCalledWith('room:kitchen');
    expect(mockServer.to).toHaveBeenCalledWith('room:waiter');
    expect(mockServer.to).toHaveBeenCalledWith('room:table:Meja 01');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'order:status_changed',
      expect.objectContaining({ orderId: 'ord-1', status: 'SERVED' }),
    );
  });

  it('should emit table status changed event', () => {
    const table = { id: 'tbl-1', number: 'Meja 01', status: 'WAITING_CLEANUP' };
    gateway.emitTableStatusChanged(table);

    expect(mockServer.to).toHaveBeenCalledWith('room:waiter');
    expect(mockServer.to).toHaveBeenCalledWith('room:cashier');
    expect(mockServer.emit).toHaveBeenCalledWith(
      'table:status_changed',
      expect.objectContaining({ number: 'Meja 01', status: 'WAITING_CLEANUP' }),
    );
  });
});
