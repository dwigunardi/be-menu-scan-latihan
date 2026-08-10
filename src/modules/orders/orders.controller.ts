import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  QueryOrderDto,
} from './dto/order.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Orders')
@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // -------------------------------------------------------------
  // Public Customer Endpoints (Cart & Order Placement)
  // -------------------------------------------------------------

  @Public()
  @Post('public/orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Customer place new order from cart' })
  @ApiResponse({ status: 201, description: 'Order placed successfully' })
  @ApiResponse({ status: 400, description: 'Menu item unavailable or invalid' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Public()
  @Get('public/orders/:orderNumber')
  @ApiOperation({ summary: 'Customer track order status by order number' })
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderByNumber(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.findByOrderNumber(orderNumber);
  }

  // -------------------------------------------------------------
  // Admin Endpoints (Kitchen / Cashier Live Orders)
  // -------------------------------------------------------------

  @Get('admin/orders')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin monitor live orders list' })
  @ApiResponse({ status: 200, description: 'List of live orders' })
  async getAdminOrders(@Query() query: QueryOrderDto) {
    return this.ordersService.findAllAdmin(query);
  }

  @Patch('admin/orders/:id/status')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Admin update order status (Kitchen / Cashier)' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }
}
