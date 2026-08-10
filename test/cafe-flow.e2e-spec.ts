import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ZodValidationPipe } from 'nestjs-zod';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { EncryptPayloadInterceptor } from '../src/common/interceptors/encrypt-payload.interceptor';
import { EcdhService } from '../src/common/crypto/ecdh.service';
import { CryptoService } from '../src/common/crypto/crypto.service';

describe('MenuScan Cafe Full Flow with RBAC & Lifecycle (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;
  let waiterToken: string;
  let tableId: string;
  let menuItemId: string;
  let variantOptionId: string;
  let createdOrderId: string;
  let orderNumber: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1', {
      exclude: ['api/docs', 'health'],
    });

    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());

    const reflector = app.get(Reflector);
    const ecdhService = app.get(EcdhService);
    const cryptoService = app.get(CryptoService);

    app.useGlobalInterceptors(
      new TransformInterceptor(),
      new EncryptPayloadInterceptor(reflector, ecdhService, cryptoService),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Public Customer Discovery & Table Session', () => {
    it('GET /api/v1/public/banners - should return active promo banners', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/banners')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/public/categories - should return categories with menu counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/categories')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/public/tables/Meja 01/status - should check QR table status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/tables/Meja 01/status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.number).toBe('Meja 01');
      tableId = res.body.data.tableId;
      expect(tableId).toBeDefined();
    });

    it('POST /api/v1/public/tables/Meja 01/session - should initialize guest session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/public/tables/Meja 01/session')
        .send({ customerName: 'Dwi Gunardi' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OCCUPIED');
      expect(res.body.data.customerName).toBe('Dwi Gunardi');
    });
  });

  describe('2. Public Menu Catalog & Ordering Flow', () => {
    it('GET /api/v1/public/menus - should browse menu items', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/menus')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      menuItemId = res.body.data[0].id;
    });

    it('GET /api/v1/public/menus/:id - should get detailed menu with variants', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/menus/${menuItemId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(menuItemId);
      if (res.body.data.variantGroups?.length > 0) {
        variantOptionId = res.body.data.variantGroups[0].options[0]?.id;
      }
    });

    it('POST /api/v1/public/orders - should place customer order from cart', async () => {
      const orderPayload = {
        tableId,
        customerName: 'Dwi Gunardi',
        items: [
          {
            menuItemId,
            quantity: 2,
            notes: 'Less sweet please',
            selectedVariants: variantOptionId
              ? [
                  {
                    groupName: 'Ukuran',
                    optionName: 'Regular',
                    extraPrice: 0,
                  },
                ]
              : [],
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .send(orderPayload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toBeDefined();
      expect(res.body.data.status).toBe('PENDING');

      createdOrderId = res.body.data.id;
      orderNumber = res.body.data.orderNumber;
    });

    it('GET /api/v1/public/orders/:orderNumber - should track order status', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/orders/${orderNumber}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toBe(orderNumber);
      expect(res.body.data.status).toBe('PENDING');
    });
  });

  describe('3. Staff Authentication & RBAC Access Controls', () => {
    it('should login all 4 staff roles successfully', async () => {
      // 1. Admin Login
      const adminRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@menuscan.com', password: 'admin123' })
        .expect(200);
      adminToken = adminRes.body.data.accessToken;
      expect(adminRes.body.data.user.role).toBe('ADMIN');

      // 2. Kitchen Login
      const kitchenRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'kitchen@menuscan.com', password: 'kitchen123' })
        .expect(200);
      kitchenToken = kitchenRes.body.data.accessToken;
      expect(kitchenRes.body.data.user.role).toBe('KITCHEN');

      // 3. Cashier Login
      const cashierRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'cashier@menuscan.com', password: 'cashier123' })
        .expect(200);
      cashierToken = cashierRes.body.data.accessToken;
      expect(cashierRes.body.data.user.role).toBe('CASHIER');

      // 4. Waiter Login
      const waiterRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'waiter@menuscan.com', password: 'waiter123' })
        .expect(200);
      waiterToken = waiterRes.body.data.accessToken;
      expect(waiterRes.body.data.user.role).toBe('WAITER');
    });

    it('RBAC Check: Kitchen role should be blocked from Financial Reports (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/reports/revenue')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .expect(403);
    });

    it('RBAC Check: Kitchen role can monitor orders and transition status to PREPARING -> SERVED', async () => {
      // 1. Kitchen updates to PREPARING
      const prepRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);
      expect(prepRes.body.data.status).toBe('PREPARING');

      // 2. Waiter / Kitchen updates to SERVED
      const servedRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({ status: 'SERVED' })
        .expect(200);
      expect(servedRes.body.data.status).toBe('SERVED');
    });

    it('Cashier marks order as PAID -> Table automatically becomes WAITING_CLEANUP', async () => {
      const paidRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ status: 'PAID' })
        .expect(200);

      expect(paidRes.body.data.status).toBe('PAID');
      expect(paidRes.body.data.paidAt).toBeDefined();

      // Check table status is now WAITING_CLEANUP
      const tableStatusRes = await request(app.getHttpServer())
        .get('/api/v1/public/tables/Meja 01/status')
        .expect(200);
      expect(tableStatusRes.body.data.status).toBe('WAITING_CLEANUP');
    });

    it('Waiter cleans dishes and resets table -> Table becomes VACANT', async () => {
      const resetRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/tables/${tableId}/reset`)
        .set('Authorization', `Bearer ${waiterToken}`)
        .expect(200);

      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.data.table.status).toBe('VACANT');
      expect(resetRes.body.data.table.activeCustomerName).toBeNull();
    });

    it('Admin can access consolidated dashboard overview & revenue reports', async () => {
      const overviewRes = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/dashboard-overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(overviewRes.body.success).toBe(true);
      expect(overviewRes.body.data.kpi.todayRevenue).toBeGreaterThan(0);
      expect(overviewRes.body.data.kpi.todayOrdersCount).toBeGreaterThan(0);
    });
  });
});
