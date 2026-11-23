import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderPaymentService } from './order-payment.service';
import { ShiftsModule } from '../shifts/shifts.module';

@Module({
  imports: [ShiftsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderPaymentService],
  exports: [OrdersService, OrderPaymentService],
})
export class OrdersModule {}
