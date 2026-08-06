# Wireframe API & System Design (Draft / Not Final)

> **Project**: MenuScan – Digital QR Code Menu System  
> **Status**: Work In Progress / Brainstorming Phase  
> **Backend Tech**: NestJS, PostgreSQL, Prisma ORM, Zod Validation  
> **Security Tech**: JWT (Access Token + Refresh Token), Payload Encryption Handshake (AES-256-GCM)  

---

## 🌐 Endpoints API Wireframe

> 🔐 **Catatan Enkripsi**: Seluruh *Request Body* dan *Response Payload* (kecuali upload multipart file) di-handshake dan dienkripsi/dideskripsi menggunakan strategi AES-256-GCM.  
> Lihat spesifikasi lengkap di [encryption-decryption-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/security/encryption-decryption-strategy.md).

---

### 🟢 1. Public Endpoints (Pelanggan / Public Next.js View)
Akses publik tanpa otentikasi. Digunakan oleh halaman menu restoran via QR Code.

| Method | Endpoint | Description | Query Params / Body | Response / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/public/categories` | Ambil semua kategori aktif | - | Return list kategori & sortOrder |
| `GET` | `/api/v1/public/menus` | Ambil daftar menu | `categoryId`, `search`, `isAvailable` | Filter menu & search |
| `GET` | `/api/v1/public/menus/:id` | Detail menu tunggal | `id` (path) | Response detail item menu |

---

### 🔐 2. Auth Endpoints (JWT Dual Token & Handshake Strategy)

Sistem menggunakan **Access Token** (masa berlaku singkat: 15 menit) dan **Refresh Token** (masa berlaku panjang: 7 hari + tersimpan secure/hashed di DB).

| Method | Endpoint | Description | Payload Body / Header | Response / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/handshake` | Pertukaran kunci / Inisialisasi sesi enkripsi | `{ clientPublicKey? }` | `{ serverHandshakeToken, sessionKey }` |
| `POST` | `/api/v1/auth/login` | Login admin restoran | `{ email, password }` | `{ accessToken, refreshToken }` |
| `POST` | `/api/v1/auth/refresh` | Perbarui Access Token yang kadaluarsa | `{ refreshToken }` atau via HTTP Cookie | `{ accessToken, refreshToken }` |
| `POST` | `/api/v1/auth/logout` | Revoke Refresh Token & Logout | Header: `Bearer <accessToken>` | `{ success: true }` |
| `GET` | `/api/v1/auth/me` | Cek profil admin terautentikasi | Header: `Bearer <accessToken>` | User object tanpa password |

---

### 🔴 3. Admin Endpoints (Protected by JWT Guard)
Memerlukan header otentikasi: `Authorization: Bearer <accessToken>`

#### Category Management (Zod Schema Validated)
| Method | Endpoint | Description | Payload Body (Zod DTO) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/categories` | List semua kategori (termasuk metadata) | - |
| `POST` | `/api/v1/admin/categories` | Tambah kategori baru | `{ name: string, sortOrder?: number }` |
| `PATCH` | `/api/v1/admin/categories/:id` | Edit kategori | `{ name?: string, sortOrder?: number }` |
| `DELETE` | `/api/v1/admin/categories/:id` | Hapus kategori | - |

#### Menu Items Management (Zod Schema Validated)
| Method | Endpoint | Description | Payload Body (Zod DTO) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/menus` | List semua menu (pagination & filter) | Params: `page`, `limit`, `search` |
| `POST` | `/api/v1/admin/menus` | Buat menu baru | `{ name, description?, price, categoryId, imageUrl? }` |
| `PATCH` | `/api/v1/admin/menus/:id` | Edit data menu | `{ name?, description?, price?, categoryId?, imageUrl? }` |
| `PATCH` | `/api/v1/admin/menus/:id/status` | Fast toggle status ketersediaan | `{ isAvailable: boolean }` |
| `DELETE` | `/api/v1/admin/menus/:id` | Hapus menu | - |

---

## 🗄️ Database Schema Blueprint (Prisma)

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  password     String   // Hashed bcrypt/argon2
  name         String
  refreshToken String?  // Hashed Refresh Token untuk Revocation Strategy
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Category {
  id        String     @id @default(uuid())
  name      String
  slug      String     @unique
  sortOrder Int        @default(0)
  menuItems MenuItem[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model MenuItem {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Decimal  @db.Decimal(10, 2)
  imageUrl    String?
  isAvailable Boolean  @default(true)
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([categoryId])
  @@index([isAvailable])
}
```

---

## 📦 Planned Package Dependencies (NestJS)

- **Database**: `prisma`, `@prisma/client`
- **Auth Strategy**: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `@types/bcrypt`
- **Validation**: `zod`, `nestjs-zod` *(Menggantikan class-validator untuk Zod Schema type-safety)*
- **Security & Enkripsi**: `node:crypto` (Native Node.js AES-256-GCM)
- **Config**: `@nestjs/config`
- **Docs**: `@nestjs/swagger`, `swagger-ui-express`, `nestjs-zod` (Auto OpenAPI integration)

---

## 📝 Open Discussion / Unfinished Notes

- [x] Tambahkan Zod validation type.
- [x] Terapkan strategi Access Token + Refresh Token.
- [x] Strategi Payload Encryption/Decryption Handshake (Tersimpan di `docs/security/encryption-decryption-strategy.md`).
- [ ] Penentuan strategi upload foto (Local Static Upload vs Cloud Storage Cloudinary/S3).
- [ ] Fitur simulasi Order Cart: Apakah perlu simpan temporary order di backend atau cukup client-side state?
