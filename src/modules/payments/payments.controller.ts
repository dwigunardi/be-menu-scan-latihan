import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SkipEncryption } from '../../common/decorators/skip-encryption.decorator';
import { ZodResponse } from '../../common/decorators/zod-response.decorator';
import { PaymentsService } from './payments.service';
import {
  CreateQrisDto,
  PaymentWebhookDto,
  QrisResponseSchema,
  WebhookResponseSchema,
} from './dto/payments.dto';

@ApiTags('Public - Payments & QRIS')
@Controller('public/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @ZodResponse(QrisResponseSchema)
  @Post('create-qris')
  @ApiOperation({
    summary: 'Generate dynamic QRIS payload for order checkout',
    description: 'Generates a 15-minute dynamic QRIS string and transaction ID for mobile customer payment.',
  })
  @ApiResponse({ status: 200, description: 'QRIS generated successfully' })
  async createQris(@Body() dto: CreateQrisDto) {
    return this.paymentsService.createQris(dto);
  }

  @Public()
  @SkipEncryption()
  @HttpCode(HttpStatus.OK)
  @ZodResponse(WebhookResponseSchema)
  @Post('webhook')
  @ApiOperation({
    summary: 'Payment gateway callback webhook (Midtrans / Xendit simulation)',
    description: 'Receives signed callback from payment gateway, validates SHA-512 signature, marks order PAID, and broadcasts real-time WebSocket alert to kitchen KDS.',
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handleWebhook(@Body() dto: PaymentWebhookDto) {
    return this.paymentsService.handleWebhook(dto);
  }
}
