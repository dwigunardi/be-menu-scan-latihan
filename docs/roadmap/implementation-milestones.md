# Implementation Milestones & Project Roadmap

> **Project**: MenuScan – Digital QR Code Menu System  
> **Backend Framework**: NestJS (TypeScript)  
> **Document Location**: `docs/roadmap/implementation-milestones.md`  
> **Status**: Active Project Tracking Document  

---

## 📊 Overview Progress Summary

| Phase | Description | Status | Completion |
| :--- | :--- | :---: | :---: |
| **Phase 0** | Planning, Architecture & Database Setup | ✅ **DONE** | 100% |
| **Phase 1** | Core Foundation & Infrastructure Modules | ✅ **DONE** | 100% |
| **Phase 2** | Global Security, Validation & Swagger | ✅ **DONE** | 100% |
| **Phase 3** | Feature Domain Modules (Business Logic) | ✅ **DONE** | 100% |
| **Phase 4** | Seeding, Verification & Finalization | ⏳ **IN PROGRESS** | 0% |

---

## ✅ Phase 0: Planning, Architecture & Database Setup (COMPLETED)

- [x] **0.1. API Wireframe Specification**
  - Document: [wireframe-api-not-final.md](file:///d:/code/be-menu-scan-latihan/docs/wireframe/wireframe-api-not-final.md)
  - Detail endpoint publik, auth, admin, meja, pesanan, banner promo, & laporan.
- [x] **0.2. Payload Encryption & ECDH Handshake Strategy**
  - Document: [encryption-decryption-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/security/encryption-decryption-strategy.md)
  - Spesifikasi AES-256-GCM, HKDF, & handshake protocol.
- [x] **0.3. Architecture Design Specification**
  - Document: [architecture-design.md](file:///d:/code/be-menu-scan-latihan/docs/architecture/architecture-design.md)
  - Struktur folder modular `src/` & Mermaid execution lifecycle.
- [x] **0.4. Step-Tracing Logging Strategy**
  - Document: [logging-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/architecture/logging-strategy.md)
  - Pino structured logging, data redaction, & Opsi B (Hybrid Transport).
- [x] **0.5. Database & Query Strategy**
  - Document: [database-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/architecture/database-strategy.md)
  - Indexing strategy, soft delete, N+1 query prevention, & slow query monitoring.
- [x] **0.6. Environment & Package Dependencies**
  - File: [.env](file:///d:/code/be-menu-scan-latihan/.env) & [.env.example](file:///d:/code/be-menu-scan-latihan/.env.example)
  - Package `prisma`, `zod`, `nestjs-zod`, `nestjs-pino`, `@nestjs/jwt`, `@nestjs/swagger`, `@prisma/adapter-pg`, `pg`, `bcrypt`, dll.
- [x] **0.7. Prisma Schema & Database Migration**
  - File: [schema.prisma](file:///d:/code/be-menu-scan-latihan/prisma/schema.prisma) & [prisma.config.ts](file:///d:/code/be-menu-scan-latihan/prisma.config.ts)
  - Database PostgreSQL `menuscan_db` berdiri (Tabel: `users`, `categories`, `menu_items`, `menu_item_variant_groups`, `menu_item_variant_options`, `promo_banners`, `tables`, `orders`, `order_items`, `order_item_variants`).

---

## ✅ Phase 1: Core Foundation & Infrastructure Modules (COMPLETED)

- [x] **1.1. Environment Zod Config Module** (`src/config/`)
  - Schema validasi `.env` berbasis Zod ([env.config.ts](file:///d:/code/be-menu-scan-latihan/src/config/env.config.ts) & [app.config.ts](file:///d:/code/be-menu-scan-latihan/src/config/app.config.ts)).
  - Mencegah server menyala jika ada `.env` yang salah.
- [x] **1.2. Prisma Global Module & Service** (`src/common/prisma/`)
  - `@Global()` [prisma.module.ts](file:///d:/code/be-menu-scan-latihan/src/common/prisma/prisma.module.ts).
  - Service lifecycle (`onModuleInit`, `onModuleDestroy`) & Slow Query Logger (> 500ms) di [prisma.service.ts](file:///d:/code/be-menu-scan-latihan/src/common/prisma/prisma.service.ts).
- [x] **1.3. Pino Step-Tracing Logger Module** (`src/common/logger/`)
  - Integrasi `nestjs-pino` + `pino-roll` di [logger.module.ts](file:///d:/code/be-menu-scan-latihan/src/common/logger/logger.module.ts).
  - Generasi `requestId` UUID & Masking data sensitif (`password`, `payload`, `iv`, `tag`, `authorization`).
- [x] **1.4. Crypto & ECDH Handshake Service** (`src/common/crypto/`)
  - [crypto.service.ts](file:///d:/code/be-menu-scan-latihan/src/common/crypto/crypto.service.ts): AES-256-GCM Encrypt & Decrypt + HKDF Derivation.
  - [ecdh.service.ts](file:///d:/code/be-menu-scan-latihan/src/common/crypto/ecdh.service.ts): ECDH keypair generation & session key manager.
- [x] **1.5. Decrypt Middleware & Encrypt Interceptor** (`src/common/middlewares/` & `interceptors/`)
  - [decrypt-payload.middleware.ts](file:///d:/code/be-menu-scan-latihan/src/common/middlewares/decrypt-payload.middleware.ts): Deskripsi otomatis `req.body` dari client.
  - [encrypt-payload.interceptor.ts](file:///d:/code/be-menu-scan-latihan/src/common/interceptors/encrypt-payload.interceptor.ts): Enkripsi otomatis return value controller.

---

## ✅ Phase 2: Global Security, Validation & Swagger (COMPLETED)

- [x] **2.1. Custom Decorators** (`src/common/decorators/`)
  - [public.decorator.ts](file:///d:/code/be-menu-scan-latihan/src/common/decorators/public.decorator.ts) -> Bypass JWT Guard.
  - [current-user.decorator.ts](file:///d:/code/be-menu-scan-latihan/src/common/decorators/current-user.decorator.ts) -> Extract `req.user`.
  - [skip-encryption.decorator.ts](file:///d:/code/be-menu-scan-latihan/src/common/decorators/skip-encryption.decorator.ts) -> Bypass Payload Encryption.
- [x] **2.2. Global Exception Filter** (`src/common/filters/`)
  - [global-exception.filter.ts](file:///d:/code/be-menu-scan-latihan/src/common/filters/global-exception.filter.ts) (Penanganan error terpusat ZodError, PrismaError, & HttpException dengan tag `step: "EXCEPTION_CATCH"`).
- [x] **2.3. Zod Pipe & Response Transformation** (`nestjs-zod`)
  - Integrasi `ZodValidationPipe` global di [main.ts](file:///d:/code/be-menu-scan-latihan/src/main.ts).
  - [transform.interceptor.ts](file:///d:/code/be-menu-scan-latihan/src/common/interceptors/transform.interceptor.ts) untuk standarisasi format response JSON.
- [x] **2.4. Swagger OpenAPI Setup** (`main.ts`)
  - Dokumentasi Swagger OpenAPI interaktif di `/api/docs` lengkap dengan JWT BearerAuth & Header `x-handshake-token`.

---

## ✅ Phase 3: Feature Domain Modules (Business Logic) (COMPLETED)

- [x] **3.1. Auth Module** (`src/modules/auth/`)
  - Endpoint `/api/v1/auth/handshake` (ECDH Key Exchange).
  - Endpoint `/api/v1/auth/login` (Admin Login + Hash Refresh Token).
  - Endpoint `/api/v1/auth/refresh` (Access Token Renewal).
  - Endpoint `/api/v1/auth/logout` (Revoke Refresh Token).
  - Endpoint `/api/v1/auth/me` (Profile Check).
  - Passport JWT Strategies (`JwtStrategy`, `JwtRefreshStrategy`) & Global `JwtAuthGuard`.
- [x] **3.2. Banners Module** (`src/modules/banners/`)
  - Public `GET /api/v1/public/banners` (Return promo banners aktif).
  - Admin CRUD `GET`, `POST`, `GET :id`, `PATCH`, `DELETE` `/api/v1/admin/banners`.
- [x] **3.3. Categories Module** (`src/modules/categories/`)
  - Public `GET /api/v1/public/categories` (Return list kategori + active item count).
  - Admin CRUD `GET`, `POST`, `GET :id`, `PATCH`, `DELETE` `/api/v1/admin/categories`.
  - Admin Reordering Kategori (`PATCH /api/v1/admin/categories/reorder`).
- [x] **3.4. Menus & Variants Module** (`src/modules/menus/`)
  - Public `GET /api/v1/public/menus` (Filter category, search, availability, best seller, recommended).
  - Public `GET /api/v1/public/menus/:id` (Detail menu + nested variantGroups & options).
  - Admin CRUD `GET`, `POST`, `GET :id`, `PATCH`, `DELETE` `/api/v1/admin/menus`.
  - Admin Fast Toggle `PATCH /api/v1/admin/menus/:id/status` (`isAvailable`).
- [x] **3.5. Tables Module** (`src/modules/tables/`)
  - Public `GET /api/v1/public/tables/:number/status` (Cek status meja & activeCustomerName).
  - Public `POST /api/v1/public/tables/:number/session` (Inisialisasi sesi meja & nama pemesan).
  - Admin `GET /api/v1/admin/tables`, `POST /api/v1/admin/tables`, `POST /api/v1/admin/tables/:id/reset`, `DELETE /api/v1/admin/tables/:id`.
- [x] **3.6. Orders Module** (`src/modules/orders/`)
  - Public `POST /api/v1/public/orders` (Buat pesanan baru dengan snapshot harga & variasi dalam atomic transaction).
  - Public `GET /api/v1/public/orders/:orderNumber` (Status pesanan meja).
  - Admin `GET /api/v1/admin/orders` (Live Orders Monitor Dapur/Kasir).
  - Admin `PATCH /api/v1/admin/orders/:id/status` (Update status pesanan & paidAt timestamp).
- [x] **3.7. Reports Module** (`src/modules/reports/`)
  - Admin `GET /api/v1/admin/reports/revenue` (Laporan Pendapatan, Total Order, Average Order Value).
  - Admin `GET /api/v1/admin/reports/top-selling` (Top Menu Paling Laris berdasarkan kuantitas & omset).

---

## 🌱 Phase 4: Database Seeding, Verification & Finalization

- [ ] **4.1. Database Seeder Script** (`prisma/seed.ts`)
  - Seed Admin default (`admin@menuscan.com` / `admin123`).
  - Seed Meja default (Meja 01 s/d Meja 10).
  - Seed Sampel Promo Banners.
  - Seed Sampel Kategori (Coffee, Non-Coffee, Local Favorites, Fast Food & Snacks, Desserts).
  - Seed Sampel Menu Kopi dengan Variasi (Ukuran: Regular/Large, Temperature: Hot/Iced, Extra Add-ons: Extra Shot/Creamer/Topping) & Menu tanpa Variasi (Air Mineral).
- [ ] **4.2. End-to-End API Verification**
  - Testing alur Handshake -> Login -> Scan Meja -> Pilih Variasi -> Buat Pesanan -> Status Update -> Laporan Pendapatan.
- [ ] **4.3. Final Documentation & Walkthrough Update**
  - Walkthrough final & panduan serah terima proyek.
