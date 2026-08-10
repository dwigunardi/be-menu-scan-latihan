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

describe('MenuScan Cafe Full Flow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
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

  describe('1. Public Customer Discovery (Banners, Categories, Tables)', () => {
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

  describe('3. Admin Authentication & Operations Flow', () => {
    it('POST /api/v1/auth/login - should authenticate admin and return JWT tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@menuscan.com',
          password: 'admin123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      adminToken = res.body.data.accessToken;
    });

    it('GET /api/v1/auth/me - should get admin profile with Bearer Auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('admin@menuscan.com');
    });

    it('GET /api/v1/admin/orders - should monitor live orders in kitchen', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThan(0);
    });

    it('PATCH /api/v1/admin/orders/:id/status - should update status to PREPARING -> SERVED -> PAID', async () => {
      // 1. To PREPARING
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);

      // 2. To SERVED
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SERVED' })
        .expect(200);

      // 3. To PAID
      const paidRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${createdOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PAID' })
        .expect(200);

      expect(paidRes.body.data.status).toBe('PAID');
      expect(paidRes.body.data.paidAt).toBeDefined();
    });

    it('POST /api/v1/admin/tables/:id/reset - should reset table back to VACANT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/tables/${tableId}/reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.table.status).toBe('VACANT');
      expect(res.body.data.table.activeCustomerName).toBeNull();
    });

    it('GET /api/v1/admin/reports/revenue - should return updated revenue metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/revenue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRevenue).toBeGreaterThan(0);
      expect(res.body.data.totalOrders).toBeGreaterThan(0);
    });

    it('GET /api/v1/admin/reports/top-selling - should return top selling analytics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports/top-selling')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
