# ?? Enterprise Modular Backend Boilerplate (NestJS 11 + Prisma 7 + PostgreSQL)

Boilerplate backend enterprise-grade yang bersih, modular, aman, dan siap pakai untuk berbagai macam proyek aplikasi modern. Dilengkapi dengan zero-trust transport encryption, dual-token JWT authentication, universal pagination & search standard, serta integrasi Prisma ORM 7.

---

## ?? Daftar Isi
1. [Stack Teknologi & Arsitektur](#-stack-teknologi--arsitektur)
2. [Quick Start (Panduan Cepat 3 Langkah)](#-quick-start-panduan-cepat)
3. [Panduan Koneksi Database](#-panduan-koneksi-database)
4. [Tutorial Menambahkan Schema Prisma Baru](#-tutorial-menambahkan-schema-prisma-baru)
5. [Tutorial Membuat Modul Backend Baru](#-tutorial-membuat-modul-backend-baru)
6. [Tutorial Integrasi ke Frontend](#-tutorial-integrasi-ke-frontend)
7. [Standarisasi Paginasi & Search Universal](#-standarisasi-paginasi--search-universal)
8. [Keamanan Transport (ECDH + AES-256-GCM)](#-keamanan-transport-ecdh--aes-256-gcm)
9. [Kredensial Default & Endpoint API](#-kredensial-default--endpoint-api)

---

## ??? Stack Teknologi & Arsitektur

- **Framework**: [NestJS 11](https://nestjs.com/) (TypeScript strict mode)
- **Database & ORM**: [PostgreSQL 16](https://www.postgresql.org/) + [Prisma ORM 7](https://www.prisma.io/) (dengan `@prisma/adapter-pg`)
- **Cache & Session Revocation**: [Redis](https://redis.io/) (dengan fallback memory mode otomatis)
- **Autentikasi**: Dual-Token JWT (Access Token 15m + Refresh Token 7d) + RBAC Guards
- **Keamanan Transport**: Zero-Trust ECDH P-256 Key Exchange + HKDF + AES-256-GCM Payload Encryption
- **Validasi Data**: Zod + NestJS Zod Validation Pipe
- **Dokumentasi API**: Swagger OpenAPI UI (`/api/docs`)
- **Logging**: Pino Logger terstruktur

---

## ? Quick Start (Panduan Cepat)

### 1. Clone & Setup Environment
```bash
# Salin template environment
cp .env.example .env

# Install seluruh dependencies
npm install
```

### 2. Jalankan Database (Docker 1-Click)
Boilerplate ini sudah menyertakan konfigurasi `docker-compose.yml` untuk **PostgreSQL** dan **Redis**:
```bash
docker compose up -d
```

### 3. Inisialisasi Database & Seeding
```bash
# Generate Prisma Client & Adapter
npx prisma generate

# Sinkronkan schema ke database PostgreSQL
npx prisma db push

# Masukkan akun admin default
npx prisma db seed
```

### 4. Jalankan Development Server
```bash
npm run start:dev
```
- **API Base URL**: `http://localhost:5000/api/v1`
- **Swagger Documentation**: `http://localhost:5000/api/docs`

---

## ?? Panduan Koneksi Database

Anda dapat menghubungkan backend ini ke beberapa jenis database PostgreSQL sesuai preferensi:

### Opsi A: Docker Compose (Direkomendasikan untuk Lokal)
Jalankan container lokal dengan:
```bash
docker compose up -d
```
Konfigurasi di file `.env`:
```env
DATABASE_URL="postgresql://postgres:password123@localhost:5432/boilerplate_db?schema=public"
```

### Opsi B: PostgreSQL Lokal (Native / pgAdmin / DBeaver)
Jika Anda memiliki PostgreSQL yang sudah terpasang di komputer:
1. Buat database baru bernama `boilerplate_db`:
   ```sql
   CREATE DATABASE boilerplate_db;
   ```
2. Sesuaikan username dan password di file `.env`:
   ```env
   DATABASE_URL="postgresql://<USER>:<PASSWORD>@localhost:5432/boilerplate_db?schema=public"
   ```

### Opsi C: Cloud Database (Supabase / Neon / Prisma Postgres / Railway)
1. Dapatkan connection string PostgreSQL dari dashboard cloud provider Anda.
2. Masukkan ke file `.env` (pastikan menambahkan parameter `?pgbouncer=true` atau `?schema=public` jika menggunakan connection pooler):
   ```env
   DATABASE_URL="postgresql://user:pass@ep-cool-xyz.region.aws.neon.tech/neondb?sslmode=require"
   ```

> **?? Catatan Prisma 7**: Pada Prisma 7, konfigurasi datasource dan migration seed didefinisikan melalui file `prisma.config.ts`.

---

## ??? Tutorial Menambahkan Schema Prisma Baru

Untuk menambahkan model/entitas baru ke dalam database:

### Langkah 1: Tambahkan Model di `prisma/schema.prisma`
Buka file `prisma/schema.prisma` dan tambahkan model baru Anda. Contoh membuat model `Product`:

```prisma
enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model Product {
  id          String        @id @default(uuid())
  name        String
  description String?
  price       Decimal       @default(0)
  stock       Int           @default(0)
  status      ProductStatus @default(ACTIVE)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([status])
  @@index([name])
}
```

### Langkah 2: Format & Generate Client
```bash
# 1. Format file schema
npx prisma format

# 2. Generate TypeScript types Prisma Client
npx prisma generate
```

### Langkah 3: Terapkan ke Database
Pilih salah satu metode:
- **Metode A (Prototyping Cepat)**:
  ```bash
  npx prisma db push
  ```
- **Metode B (Migration Ber-riwayat untuk Production)**:
  ```bash
  npx prisma migrate dev --name create_products_table
  ```

### Langkah 4: Tambahkan Data Seeding (Opsional)
Buka `prisma/seed.ts` dan tambahkan query seeding:
```typescript
await prisma.product.createMany({
  data: [
    { name: 'Produk Contoh A', price: 50000, stock: 100 },
    { name: 'Produk Contoh B', price: 75000, stock: 50 },
  ],
  skipDuplicates: true,
});
```
Jalankan seed:
```bash
npx prisma db seed
```

---

## ??? Tutorial Membuat Modul Backend Baru

Berikut contoh langkah-langkah membuat modul baru (misal: `ProductsModule`):

### 1. Buat Struktur Folder
```
src/modules/products/
  +-- dto/
  ¦   +-- product.dto.ts
  +-- products.controller.ts
  +-- products.service.ts
  +-- products.module.ts
  +-- products.service.spec.ts
```

### 2. Buat DTO (`src/modules/products/dto/product.dto.ts`)
Gunakan helper `PaginationQuerySchema` untuk mewarisi fitur paginasi dan filter universal:

```typescript
import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

export const CreateProductSchema = z.object({
  name: z.string().min(2, 'Nama produk minimal 2 karakter'),
  description: z.string().optional(),
  price: z.number().nonnegative('Harga tidak boleh negatif'),
  stock: z.number().int().nonnegative().default(0),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const QueryProductSchema = PaginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  sortBy: z.enum(['name', 'price', 'stock', 'createdAt']).default('createdAt'),
});
export type QueryProductDto = z.infer<typeof QueryProductSchema>;
```

### 3. Buat Service (`src/modules/products/products.service.ts`)
Gunakan helper `getPrismaPagination` dan `createPaginatedResult`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, QueryProductDto } from './dto/product.dto';
import { getPrismaPagination, createPaginatedResult } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryProductDto) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const pagination = getPrismaPagination(page, limit);

    const where: Prisma.ProductWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        ...pagination,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.product.count({ where }),
    ]);

    return createPaginatedResult(items, totalItems, page, limit);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Product #${id} tidak ditemukan.`);
    return product;
  }

  async create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    return { success: true, message: 'Product berhasil dihapus' };
  }
}
```

### 4. Buat Controller (`src/modules/products/products.controller.ts`)
```typescript
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, QueryProductDto, CreateProductSchema, UpdateProductSchema, QueryProductSchema } from './dto/product.dto';
import { ZodValidationPipe } from '../../common/filters/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Admin - Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Daftar produk dengan paginasi & search' })
  findAll(@Query(new ZodValidationPipe(QueryProductSchema)) query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
```

### 5. Daftarkan di `src/app.module.ts`
Buka `src/app.module.ts` dan masukkan `ProductsModule` ke array `imports`.

---

## ?? Tutorial Integrasi ke Frontend

Pada repository Frontend (`fe-menu-scan-latihan`):

### 1. Buat API Client (`src/lib/api/admin-products-api.ts`)
```typescript
import { customFetch } from './custom-fetch';
import { Either } from './either';
import { ApiError } from './api-error';
import { PaginatedResult } from '@/types/pagination';

export interface ProductData {
  id: string;
  name: string;
  price: number;
  stock: number;
  status: string;
  createdAt: string;
}

export async function getAdminProducts(params = {}): Promise<Either<ApiError, PaginatedResult<ProductData>>> {
  const query = new URLSearchParams(params as any);
  return customFetch<PaginatedResult<ProductData>>(`/admin/products?${query.toString()}`);
}
```

### 2. Buat TanStack Query Hook (`src/hooks/queries/use-admin-products.ts`)
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminProducts } from '@/lib/api/admin-products-api';
import { notifyApiError } from '@/lib/api/notify-error';

export function useAdminProductsQuery(params = {}) {
  return useQuery({
    queryKey: ['admin', 'products', params],
    queryFn: async () => {
      const res = await getAdminProducts(params);
      if (res.isLeft()) {
        notifyApiError(res.value);
        throw res.value;
      }
      return res.value;
    },
  });
}
```

### 3. Panggil di Halaman React Component
```tsx
'use client';

import { useState } from 'react';
import { useAdminProductsQuery } from '@/hooks/queries/use-admin-products';

export default function AdminProductsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAdminProductsQuery({ search, limit: 10 });

  if (isLoading) return <div>Memuat data produk...</div>;

  return (
    <div>
      <h1>Daftar Produk</h1>
      {data?.items.map((item) => (
        <div key={item.id}>{item.name} - Rp {item.price.toLocaleString('id-ID')}</div>
      ))}
    </div>
  );
}
```

---

## ?? Standarisasi Paginasi & Search Universal

Seluruh endpoint bertipe list merespons dengan struktur JSON terstandarisasi:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "items": [
      {
        "id": "item-uuid",
        "name": "Contoh Item"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "totalItems": 45,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### Fitur Paginasi Khusus:
- **Mengambil Semua Data (`getAll`)**: Frontend cukup mengirimkan parameter `limit: -1`. Backend akan mengembalikan seluruh baris data dalam 1 halaman (`totalPages: 1`).
- **Pencarian Cepat**: Kirim parameter `search=keyword` untuk melakukan pencarian *case-insensitive* ke beberapa kolom sekaligus.
- **Sorting Fleksibel**: Kirim parameter `sortBy=kolom` dan `sortOrder=asc|desc`.

---

## ?? Keamanan Transport (ECDH + AES-256-GCM)

Sistem ini menerapkan proteksi **Zero-Trust Payload Encryption**:
1. Client menghasilkan public key P-256 dan mengirimkannya saat negosiasi (`POST /api/v1/auth/handshake`).
2. Server merespons dengan server public key P-256 dan token handshake unik.
3. Kedua pihak menurunkan kunci simetris 256-bit menggunakan HKDF-SHA256 dengan shared nonce.
4. Seluruh payload sensitif terenkripsi secara otomatis menggunakan AES-256-GCM.

---

## ?? Kredensial Default & Endpoint API

| Peran | Email / Username | Password | Hak Akses |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@menuscan.com` | `admin123` | Akses Penuh Seluruh Portal |

### Endpoint Penting:
- **Swagger Documentation**: `GET http://localhost:5000/api/docs`
- **Handshake Negosiasi Kunci**: `POST /api/v1/auth/handshake`
- **Login Petugas / Admin**: `POST /api/v1/auth/login`
- **Refresh Token**: `POST /api/v1/auth/refresh`
- **Manajemen Pengguna**: `GET/POST/PATCH/DELETE /api/v1/admin/users`
