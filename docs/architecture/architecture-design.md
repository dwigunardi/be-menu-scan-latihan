# MenuScan Backend System Architecture Specification

> **Project**: MenuScan – Digital QR Code Menu System  
> **Backend Framework**: NestJS (TypeScript)  
> **Database & ORM**: PostgreSQL & Prisma ORM  
> **Validation & Schema**: Zod & `nestjs-zod`  
> **Security & Auth**: Dual JWT (Access + Refresh Token) & ECDH AES-256-GCM Payload Encryption  
> **Document Location**: `docs/architecture/architecture-design.md`  

---

## 🏛️ 1. Architectural Pattern & Design Principles

Arsitektur aplikasi ini dibangun dengan mengadopsi **Feature-Based Modular Architecture** sesuai panduan resmi *NestJS Best Practices*. 

### Prinsip Utama:
1. **High Cohesion, Low Coupling**: Setiap domain bisnis (Auth, Categories, Menus) diisolasi dalam modulnya masing-masing.
2. **Single Responsibility Principle (SRP)**:
   - **Controller**: Hanya menangani HTTP routing, ekstraksi request, dan pemanggilan service.
   - **Service**: Menangani seluruh *business logic* dan interaksi dengan database (Prisma).
   - **DTO (Zod)**: Bertanggung jawab atas kontrak dan validasi tipe data *input/output*.
3. **Layered Lifecycle Pipeline**: Keamanan (Enkripsi/Deskripsi), Otentikasi (JWT), dan Validasi (Zod) dipisahkan secara tegas pada layer *Middleware*, *Guard*, *Pipe*, *Interceptor*, dan *Exception Filter*.

---

## 📁 2. Complete Directory Structure (`src/`)

```text
src/
├── config/                      # Pengelolaan & Validasi Environment Variable (.env)
│   ├── env.config.ts            # Schema Zod untuk validasi .env
│   └── app.config.ts            # Konfigurasi aplikasi (Port, JWT Secret, Key Expiry)
│
├── common/                      # Module & Utilitas Bersama (Cross-Cutting Concerns)
│   ├── crypto/                  # Kriptografi & Handshake Service
│   │   ├── crypto.service.ts    # AES-256-GCM Encrypt/Decrypt & HKDF Derivation
│   │   ├── ecdh.service.ts      # Pertukaran kunci ECDH (prime256v1)
│   │   └── crypto.module.ts
│   ├── decorators/              # Custom Decorators
│   │   ├── public.decorator.ts       # @Public() -> Bypass JwtAuthGuard
│   │   ├── skip-encrypt.decorator.ts# @SkipEncryption() -> Bypass Payload Encryption
│   │   └── current-user.decorator.ts# @CurrentUser() -> Extract req.user
│   ├── filters/                 # Global Exception Handling
│   │   ├── global-exception.filter.ts # Tangkap ZodError, HttpException, & PrismaError
│   │   └── http-exception.filter.ts
│   ├── guards/                  # Security Guards
│   │   ├── jwt-auth.guard.ts     # Memeriksa Access Token
│   │   ├── jwt-refresh.guard.ts  # Memeriksa Refresh Token saat /auth/refresh
│   │   └── handshake.guard.ts    # Memeriksa Keberadaan x-handshake-token
│   ├── interceptors/            # Response Transformation & Encryption
│   │   ├── encrypt-payload.interceptor.ts # Enkripsi Response JSON
│   │   └── transform.interceptor.ts       # Standarisasi JSON Response Wrapper
│   ├── middlewares/             # Request Decryption
│   │   └── decrypt-payload.middleware.ts  # Deskripsi Request Body sebelum masuk Pipe
│   └── prisma/                  # Database Singleton Module
│       ├── prisma.service.ts    # Lifecycle Connection Hook (onModuleInit, onModuleDestroy)
│       └── prisma.module.ts     # @Global() Module
│
├── modules/                     # Domain Feature Modules
│   ├── auth/                    # Modul Otentikasi & Handshake
│   │   ├── dto/                 # Zod Schemas (LoginDto, HandshakeDto, RefreshTokenDto)
│   │   ├── strategies/          # Passport Strategies (JwtStrategy, JwtRefreshStrategy)
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── categories/              # Modul Pengelolaan Kategori
│   │   ├── dto/                 # Zod Schemas (CreateCategoryDto, UpdateCategoryDto)
│   │   ├── categories.controller.ts
│   │   ├── categories.service.ts
│   │   └── categories.module.ts
│   └── menus/                   # Modul Pengelolaan Menu & Status Availability
│       ├── dto/                 # Zod Schemas (CreateMenuDto, UpdateMenuDto, QueryMenuDto)
│       ├── menus.controller.ts
│       ├── menus.service.ts
│       └── menus.module.ts
│
├── app.module.ts                # Root Application Module
└── main.ts                      # Entry Point & Bootstrap Pipeline Setup
```

---

## 🔄 3. Request & Response Lifecycle Flow

Berikut adalah alur perjalanan HTTP Request terenkripsi dari Client (Next.js) yang masuk ke NestJS hingga dikirimkan kembali sebagai HTTP Response:

```mermaid
flowchart TD
    A[Incoming Encrypted Request] --> B[DecryptPayloadMiddleware]
    
    subgraph Layer 1: Decryption
        B -->|Read Header x-handshake-token| B1{Handshake Token Valid?}
        B1 -- No --> B2[Throw 401 Handshake Expired]
        B1 -- Yes --> B3[AES-256-GCM Decrypt Payload to req.body]
    end

    B3 --> C[JwtAuthGuard / HandshakeGuard]

    subgraph Layer 2: Security & Authentication
        C -->|Check @Public Decorator| C1{Is Endpoint Public?}
        C1 -- Yes --> D[ZodValidationPipe]
        C1 -- No --> C2{Is Access Token Valid?}
        C2 -- No --> C3[Throw 401 Unauthorized]
        C2 -- Yes --> C4[Attach User Object to req.user] --> D
    end

    subgraph Layer 3: Input Validation
        D --> D1{Zod Schema Valid?}
        D1 -- No --> D2[Throw 400 Bad Request / ZodError]
        D1 -- Yes --> E[Controller & Service Logic]
    end

    subgraph Layer 4: Business Logic & DB
        E --> E1[Prisma Database Query]
        E1 --> E2[Return Raw Response Object]
    end

    E2 --> F[EncryptPayloadInterceptor]

    subgraph Layer 5: Response Encryption
        F --> F1{Is @SkipEncryption Present?}
        F1 -- Yes --> H[Send Raw Response]
        F1 -- No --> F2[AES-256-GCM Encrypt Object with Fresh IV]
        F2 --> H[Send Encrypted JSON Response]
    end

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style H fill:#bbf,stroke:#333,stroke-width:2px
```

---

## 🛠️ 4. Spesifikasi Layer Teknis

### A. Database Layer (`PrismaModule`)
- **Tipe Modul**: `@Global()` agar `PrismaService` dapat langsung di-inject tanpa re-import.
- **Connection Management**:
  - `onModuleInit()`: Mengkoneksikan Prisma Client ke PostgreSQL saat server dinyalakan.
  - `onModuleDestroy()`: Memastikan koneksi ditutup secara bersih (*graceful shutdown*) saat server berhenti.

### B. Security & Authentication Layer
1. **Dual JWT Token Strategy**:
   - **Access Token**: Berisi `userId`, `email`, `role`. Masa berlaku 15 menit. Disahkan oleh `JwtStrategy`.
   - **Refresh Token**: Berisi `userId`. Masa berlaku 7 hari. Disimpan ter-hash di DB (`User.refreshToken`). Disahkan oleh `JwtRefreshStrategy` pada endpoint `/api/v1/auth/refresh`.
2. **ECDH Payload Encryption Layer**:
   - `DecryptPayloadMiddleware`: Berjalan sebelum Guard & Controller. Membaca `x-handshake-token` untuk mengambil `SessionKey` dari Cache/Memory.
   - `EncryptPayloadInterceptor`: Interceptor global yang menangkap return value Controller dan membungkusnya menjadi ciphertext terenkripsi.

### C. Validation Layer (`nestjs-zod`)
- Menggunakan `ZodValidationPipe` menggantikan `class-validator`.
- Keuntungan Zod:
  - Tipe data TypeScript otomatis diturunkan dari Schema (`z.infer<typeof Schema>`).
  - Integrasi otomatis ke `@nestjs/swagger` untuk pembuatan OpenAPI Docs interaktif.

### D. Global Exception Handling Layer (`GlobalExceptionFilter`)
Menyediakan *response error format* yang konsisten di seluruh aplikasi:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "price",
      "message": "Price must be greater than 0"
    }
  ],
  "timestamp": "2026-08-06T09:47:00.000Z"
}
```

---

## 🔗 5. Terhubung ke Dokumentasi Terkait

- 📄 Wireframe API & Blueprint Schema: [wireframe-api-not-final.md](file:///d:/code/be-menu-scan-latihan/docs/wireframe/wireframe-api-not-final.md)
- 📄 Spesifikasi Enkripsi Payload: [encryption-decryption-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/security/encryption-decryption-strategy.md)
