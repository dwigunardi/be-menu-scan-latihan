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
| **Phase 1** | Core Foundation & Infrastructure Modules | ⏳ **IN PROGRESS** | 0% |
| **Phase 2** | Global Security, Validation & Swagger | ⬜ **PENDING** | 0% |
| **Phase 3** | Feature Domain Modules (Business Logic) | ⬜ **PENDING** | 0% |
| **Phase 4** | Seeding, Verification & Finalization | ⬜ **PENDING** | 0% |

---

## ✅ Phase 0: Planning, Architecture & Database Setup (COMPLETED)

- [x] **0.1. API Wireframe Specification**
  - Document: [wireframe-api-not-final.md](file:///d:/code/be-menu-scan-latihan/docs/wireframe/wireframe-api-not-final.md)
  - Detail endpoint publik, auth, & admin.
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
  - Package `prisma`, `zod`, `nestjs-zod`, `nestjs-pino`, `@nestjs/jwt`, `@nestjs/swagger`, `bcrypt`, dll.
- [x] **0.7. Prisma Schema & Database Migration**
  - File: [schema.prisma](file:///d:/code/be-menu-scan-latihan/prisma/schema.prisma) & [prisma.config.ts](file:///d:/code/be-menu-scan-latihan/prisma.config.ts)
  - Database PostgreSQL `menuscan_db` berdiri & terverifikasi via DBeaver ERD.

---

## 🏗️ Phase 1: Core Foundation & Infrastructure Modules

- [ ] **1.1. Environment Zod Config Module** (`src/config/`)
  - Schema validasi `.env` berbasis Zod (`env.config.ts`).
  - Mencegah server menyala jika ada `.env` yang salah.
- [ ] **1.2. Prisma Global Module & Service** (`src/common/prisma/`)
  - `@Global()` `PrismaModule`.
  - Service lifecycle (`onModuleInit`, `onModuleDestroy`).
  - Prisma Extension / Slow Query Logger (> 500ms).
- [ ] **1.3. Pino Step-Tracing Logger Module** (`src/common/logger/`)
  - Integrasi `nestjs-pino` + `pino-roll` (Hybrid Transport).
  - Masking data sensitif (`password`, `payload`, `iv`, `tag`, `authorization`).
- [ ] **1.4. Crypto & ECDH Handshake Service** (`src/common/crypto/`)
  - `CryptoService`: AES-256-GCM Encrypt & Decrypt + HKDF Derivation.
  - `EcdhService`: ECDH keypair generation & shared secret computation.
- [ ] **1.5. Decrypt Middleware & Encrypt Interceptor** (`src/common/middlewares/` & `interceptors/`)
  - `DecryptPayloadMiddleware`: Deskripsi otomatis `req.body` dari client.
  - `EncryptPayloadInterceptor`: Enkripsi otomatis return value controller.

---

## 🛡️ Phase 2: Global Security, Validation & Swagger

- [ ] **2.1. Zod Validation Pipe Integration** (`nestjs-zod`)
  - Integrasi global `ZodValidationPipe` pada `main.ts`.
- [ ] **2.2. Global Exception Filter** (`src/common/filters/`)
  - `GlobalExceptionFilter` (Tangkap ZodError, PrismaError, & HttpException).
- [ ] **2.3. Custom Decorators** (`src/common/decorators/`)
  - `@Public()` -> Bypass JWT Guard.
  - `@SkipEncryption()` -> Bypass Payload Encryption.
  - `@CurrentUser()` -> Extract `req.user`.
- [ ] **2.4. Swagger OpenAPI Setup** (`main.ts`)
  - Pasang Swagger UI pada `/api/docs` yang terintegrasi dengan DTO Zod.

---

## 🧩 Phase 3: Feature Domain Modules (Business Logic)

- [ ] **3.1. Auth Module** (`src/modules/auth/`)
  - Endpoint `/api/v1/auth/handshake` (ECDH Key Exchange).
  - Endpoint `/api/v1/auth/login` (Admin Login + Hash Refresh Token).
  - Endpoint `/api/v1/auth/refresh` (Access Token Renewal).
  - Endpoint `/api/v1/auth/logout` (Revoke Refresh Token).
  - Passport JWT Strategies (`JwtStrategy`, `JwtRefreshStrategy`) & Guards.
- [ ] **3.2. Categories Module** (`src/modules/categories/`)
  - Public `GET /api/v1/public/categories` (Return list kategori + item count).
  - Admin CRUD `GET`, `POST`, `PATCH`, `DELETE` `/api/v1/admin/categories`.
  - Admin Reordering Kategori (`sortOrder`).
- [ ] **3.3. Menus Module** (`src/modules/menus/`)
  - Public `GET /api/v1/public/menus` (Filter by category, search, availability).
  - Public `GET /api/v1/public/menus/:id` (Detail menu).
  - Admin CRUD `GET`, `POST`, `PATCH`, `DELETE` `/api/v1/admin/menus`.
  - Admin Fast Toggle `PATCH /api/v1/admin/menus/:id/status` (`isAvailable`).

---

## 🌱 Phase 4: Database Seeding, Verification & Finalization

- [ ] **4.1. Database Seeder Script** (`prisma/seed.ts`)
  - Seed Admin default (`admin@menuscan.com` / `admin123`).
  - Seed sampel Kategori (Makanan Utama, Minuman, Dessert) & sampel Menu.
- [ ] **4.2. End-to-End API Verification**
  - Testing alur Handshake -> Login -> Admin CRUD -> Public Menu View.
- [ ] **4.3. Final Documentation & Walkthrough Update**
  - Walkthrough final & panduan serah terima proyek.
