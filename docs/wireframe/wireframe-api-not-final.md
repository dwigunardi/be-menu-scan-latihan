# Wireframe API & System Design (Draft / Updated with Table Binding & Orders)

> **Project**: MenuScan – Digital QR Code Menu System  
> **Status**: Work In Progress / Architecture & API Blueprint  
> **Backend Tech**: NestJS, PostgreSQL, Prisma ORM, Zod Validation  
> **Security Tech**: JWT Dual Token (Admin), Guest Table-Session Token (Customer), Payload Encryption Handshake (AES-256-GCM)  

---

## 🌐 Endpoints API Wireframe

> 🔐 **Catatan Enkripsi**: Seluruh *Request Body* dan *Response Payload* (kecuali upload multipart file) di-handshake dan dienkripsi/dideskripsi menggunakan strategi AES-256-GCM.  
> Lihat spesifikasi lengkap di [encryption-decryption-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/security/encryption-decryption-strategy.md).

---

### 🟢 1. Public Customer Endpoints (Pelanggan via QR Code / Next.js)
Akses publik tanpa login akun. Menggunakan **Handshake Token** (`x-handshake-token`) & **Guest Table-Session Token**.

| Method | Endpoint | Description | Query Params / Body | Response / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/public/categories` | Ambil semua kategori aktif | - | Return list kategori & count menu |
| `GET` | `/api/v1/public/menus` | Ambil daftar menu | `categoryId`, `search`, `isAvailable` | Filter menu & search |
| `GET` | `/api/v1/public/menus/:id` | Detail menu tunggal | `id` (path) | Detail menu item |
| `GET` | `/api/v1/public/tables/:number/status` | Cek status meja & nama pemesan aktif | `number` (path) | `{ status: "VACANT\|OCCUPIED", activeCustomerName? }` |
| `POST` | `/api/v1/public/tables/:number/session` | Inisialisasi sesi meja (Input Nama) | `{ customerName }` | `{ tableSessionToken, customerName }` |
| `POST` | `/api/v1/public/orders` | Buat pesanan baru dari cart | `{ tableSessionToken, items: [{ menuItemId, quantity, notes? }] }` | `{ orderNumber, totalAmount, status: "PENDING" }` |
| `GET` | `/api/v1/public/orders/:orderNumber` | Cek status pesanan meja | `orderNumber` (path) | Detail status pesanan (`PENDING`, `PREPARING`, `SERVED`) |

---

### 🔐 2. Auth Endpoints (JWT Admin Dual Token Strategy)

| Method | Endpoint | Description | Payload Body / Header | Response / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/handshake` | Pertukaran kunci / Inisialisasi sesi enkripsi | `{ clientPublicKey, nonce }` | `{ serverPublicKey, handshakeToken }` |
| `POST` | `/api/v1/auth/login` | Login admin restoran | `{ email, password }` | `{ accessToken, refreshToken }` |
| `POST` | `/api/v1/auth/refresh` | Perbarui Access Token | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| `POST` | `/api/v1/auth/logout` | Revoke Refresh Token | Header: `Bearer <accessToken>` | `{ success: true }` |
| `GET` | `/api/v1/auth/me` | Cek profil admin | Header: `Bearer <accessToken>` | User object tanpa password |

---

### 🔴 3. Admin Endpoints (Protected by JWT Guard)
Memerlukan header otentikasi: `Authorization: Bearer <accessToken>`

#### Category Management (Zod Schema Validated)
| Method | Endpoint | Description | Payload Body (Zod DTO) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/categories` | List semua kategori | - |
| `POST` | `/api/v1/admin/categories` | Tambah kategori baru | `{ name: string, sortOrder?: number }` |
| `PATCH` | `/api/v1/admin/categories/:id` | Edit kategori | `{ name?: string, sortOrder?: number }` |
| `DELETE` | `/api/v1/admin/categories/:id` | Soft delete kategori | - |

#### Menu Items Management (Zod Schema Validated)
| Method | Endpoint | Description | Payload Body (Zod DTO) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/menus` | List semua menu (pagination & filter) | Params: `page`, `limit`, `search` |
| `POST` | `/api/v1/admin/menus` | Buat menu baru | `{ name, description?, price, categoryId, imageUrl? }` |
| `PATCH` | `/api/v1/admin/menus/:id` | Edit data menu | `{ name?, description?, price?, categoryId?, imageUrl? }` |
| `PATCH` | `/api/v1/admin/menus/:id/status` | Fast toggle status ketersediaan | `{ isAvailable: boolean }` |
| `DELETE` | `/api/v1/admin/menus/:id` | Soft delete menu | - |

#### Table & Order CMS Management
| Method | Endpoint | Description | Payload Body (Zod DTO) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/tables` | List semua meja & statusnya | - |
| `POST` | `/api/v1/admin/tables` | Tambah meja baru | `{ number: string }` |
| `POST` | `/api/v1/admin/tables/:id/reset` | Reset status meja menjadi `VACANT` | - |
| `GET` | `/api/v1/admin/orders` | Monitor pesanan masuk (Live Orders) | Params: `status`, `tableNumber` |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Update status pesanan (Dapur/Kasir) | `{ status: "PREPARING\|SERVED\|PAID\|CANCELLED" }` |

#### Revenue & Analytics Reports
| Method | Endpoint | Description | Query Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/reports/revenue` | Laporan pendapatan & omset | `startDate`, `endDate` |
| `GET` | `/api/v1/admin/reports/top-selling` | Top menu paling laris | `limit` (default: 5) |

---

## 🗄️ Database Schema Blueprint (Prisma)

```prisma
enum TableStatus {
  VACANT
  OCCUPIED
  WAITING_PAYMENT
}

enum OrderStatus {
  PENDING
  PREPARING
  SERVED
  PAID
  CANCELLED
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  password     String
  name         String
  refreshToken String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Category {
  id        String     @id @default(uuid())
  name      String
  slug      String     @unique
  sortOrder Int        @default(0)
  deletedAt DateTime?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  menuItems MenuItem[]
}

model MenuItem {
  id          String      @id @default(uuid())
  name        String
  description String?
  price       Decimal     @db.Decimal(10, 2)
  imageUrl    String?
  isAvailable Boolean     @default(true)
  categoryId  String
  category    Category    @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  orderItems  OrderItem[]
  deletedAt   DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Table {
  id                 String      @id @default(uuid())
  number             String      @unique // Meja 01, Meja 02, VIP-1
  status             TableStatus @default(VACANT)
  activeCustomerName String?
  orders             Order[]
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
}

model Order {
  id           String      @id @default(uuid())
  orderNumber  String      @unique // #ORD-20260807-001
  tableId      String
  table        Table       @relation(fields: [tableId], references: [id])
  customerName String
  status       OrderStatus @default(PENDING)
  totalAmount  Decimal     @db.Decimal(10, 2)
  orderItems   OrderItem[]
  paidAt       DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

model OrderItem {
  id               String   @id @default(uuid())
  orderId          String
  order            Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  menuItemId       String
  menuItem         MenuItem @relation(fields: [menuItemId], references: [id])
  menuNameSnapshot String
  priceSnapshot    Decimal  @db.Decimal(10, 2)
  quantity         Int
  subtotal         Decimal  @db.Decimal(10, 2)
  notes            String?
  createdAt        DateTime @default(now())
}
```

---

## 📦 Planned Package Dependencies (NestJS)

- **Database**: `prisma`, `@prisma/client`
- **Auth Strategy**: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `@types/bcrypt`
- **Validation**: `zod`, `nestjs-zod`
- **Security & Enkripsi**: `node:crypto` (Native Node.js AES-256-GCM)
- **Config & Logging**: `@nestjs/config`, `nestjs-pino`, `pino-http`, `pino-roll`
- **Docs**: `@nestjs/swagger`, `swagger-ui-express`
