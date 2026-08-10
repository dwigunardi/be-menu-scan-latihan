import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/events',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    this.logger.log({
      step: 'WEBSOCKET_INIT',
      namespace: '/events',
      msg: 'Events WebSocket Gateway initialized successfully',
    });
  }

  handleConnection(client: Socket) {
    this.logger.log({
      step: 'WEBSOCKET_CLIENT_CONNECTED',
      clientId: client.id,
      msg: `Client connected: ${client.id}`,
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log({
      step: 'WEBSOCKET_CLIENT_DISCONNECTED',
      clientId: client.id,
      msg: `Client disconnected: ${client.id}`,
    });
  }

  /**
   * Ping/Pong Health Check
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', {
      timestamp: Date.now(),
      status: 'OK',
    });
  }

  /**
   * Staff: Kitchen joins KDS room
   */
  @SubscribeMessage('join:kitchen')
  handleJoinKitchen(@ConnectedSocket() client: Socket) {
    client.join('room:kitchen');
    this.logger.log({
      step: 'WEBSOCKET_ROOM_JOIN',
      room: 'room:kitchen',
      clientId: client.id,
      msg: `Kitchen client ${client.id} joined room:kitchen`,
    });
    return { success: true, room: 'room:kitchen' };
  }

  /**
   * Staff: Waiter joins floor staff room
   */
  @SubscribeMessage('join:waiter')
  handleJoinWaiter(@ConnectedSocket() client: Socket) {
    client.join('room:waiter');
    this.logger.log({
      step: 'WEBSOCKET_ROOM_JOIN',
      room: 'room:waiter',
      clientId: client.id,
      msg: `Waiter client ${client.id} joined room:waiter`,
    });
    return { success: true, room: 'room:waiter' };
  }

  /**
   * Staff: Cashier joins POS room
   */
  @SubscribeMessage('join:cashier')
  handleJoinCashier(@ConnectedSocket() client: Socket) {
    client.join('room:cashier');
    this.logger.log({
      step: 'WEBSOCKET_ROOM_JOIN',
      room: 'room:cashier',
      clientId: client.id,
      msg: `Cashier client ${client.id} joined room:cashier`,
    });
    return { success: true, room: 'room:cashier' };
  }

  /**
   * Customer: Guest joins table room (e.g. "room:table:Meja 01")
   */
  @SubscribeMessage('join:table')
  handleJoinTable(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tableNumber: string },
  ) {
    if (!data?.tableNumber) return { success: false, error: 'tableNumber is required' };
    const roomName = `room:table:${data.tableNumber}`;
    client.join(roomName);
    this.logger.log({
      step: 'WEBSOCKET_ROOM_JOIN',
      room: roomName,
      clientId: client.id,
      msg: `Guest client ${client.id} joined ${roomName}`,
    });
    return { success: true, room: roomName };
  }

  // =========================================================================
  // BROADCAST EMISSION METHODS
  // =========================================================================

  /**
   * Emits live new order to Kitchen KDS & Cashier when payment is confirmed (PAID)
   */
  emitNewPaidOrder(order: any) {
    if (!this.server) return;
    const payload = {
      order,
      soundAlert: 'kitchen_bell',
      timestamp: new Date().toISOString(),
    };

    this.server.to('room:kitchen').emit('order:new', payload);
    this.server.to('room:cashier').emit('order:new', payload);

    this.logger.log({
      step: 'WEBSOCKET_EMIT_ORDER_NEW',
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      msg: `Emitted order:new event to room:kitchen and room:cashier`,
    });
  }

  /**
   * Emits order status transitions (PREPARING, SERVED, CANCELLED)
   */
  emitOrderStatusChanged(order: any, tableNumber?: string) {
    if (!this.server) return;
    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableNumber,
      timestamp: new Date().toISOString(),
    };

    this.server.to('room:kitchen').emit('order:status_changed', payload);
    this.server.to('room:waiter').emit('order:status_changed', payload);
    this.server.to('room:cashier').emit('order:status_changed', payload);

    if (tableNumber) {
      this.server.to(`room:table:${tableNumber}`).emit('order:status_changed', payload);
    }

    this.logger.log({
      step: 'WEBSOCKET_EMIT_STATUS_CHANGED',
      orderId: order.id,
      status: order.status,
      tableNumber,
      msg: `Emitted order:status_changed [${order.status}]`,
    });
  }

  /**
   * Emits table status changes (OCCUPIED, WAITING_CLEANUP, VACANT)
   */
  emitTableStatusChanged(table: any) {
    if (!this.server) return;
    const payload = {
      tableId: table.id,
      number: table.number,
      status: table.status,
      activeCustomerName: table.activeCustomerName,
      timestamp: new Date().toISOString(),
    };

    this.server.to('room:waiter').emit('table:status_changed', payload);
    this.server.to('room:cashier').emit('table:status_changed', payload);

    this.logger.log({
      step: 'WEBSOCKET_EMIT_TABLE_STATUS',
      tableNumber: table.number,
      status: table.status,
      msg: `Emitted table:status_changed for ${table.number} -> ${table.status}`,
    });
  }
}
