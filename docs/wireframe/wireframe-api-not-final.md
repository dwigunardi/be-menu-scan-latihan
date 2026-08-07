# Wireframe API & System Design (Draft / Updated with Banners & Cafe Menu Modifiers)

> **Project**: MenuScan – Digital QR Code Menu System  
> **Status**: Work In Progress / Architecture & API Blueprint  
> **Backend Tech**: NestJS, PostgreSQL, Prisma ORM, Zod Validation  
> **Security Tech**: JWT Dual Token (Admin), Guest Table-Session Token (Customer), Payload Encryption Handshake (AES-256-GCM)

---

## 🌐 Endpoints API Wireframe

> 🔐 **Catatan Enkripsi**: Seluruh _Request Body_ dan _Response Payload_ (kecuali upload multipart file) di-handshake dan dienkripsi/dideskripsi menggunakan strategi AES-256-GCM.  
> Lihat spesifikasi lengkap di [encryption-decryption-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/security/encryption-decryption-strategy.md).

---

### 🟢 1. Public Customer Endpoints (Pelanggan via QR Code / Next.js)

Akses publik tanpa login akun. Menggunakan **Handshake Token** (`x-handshake-token`) & **Guest Table-Session Token**.

| Method | Endpoint                                | Description                          | Query Params / Body                                                                                                           | Response / Notes                                         |
| :----- | :-------------------------------------- | :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| `GET`  | `/api/v1/public/banners`                | Ambil semua banner promo aktif       | -                                                                                                                             | Return list promo banners                                |
| `GET`  | `/api/v1/public/categories`             | Ambil semua kategori aktif           | -                                                                                                                             | Return list kategori & count menu                        |
| `GET`  | `/api/v1/public/menus`                  | Ambil daftar menu                    | `categoryId`, `search`, `isAvailable`, `isBestSeller`, `isRecommended`                                                        | Filter menu & search                                     |
| `GET`  | `/api/v1/public/menus/:id`              | Detail menu & variasi/extra add-ons  | `id` (path)                                                                                                                   | Detail menu + list `variantGroups` & `options`           |
| `GET`  | `/api/v1/public/tables/:number/status`  | Cek status meja & nama pemesan aktif | `number` (path)                                                                                                               | `{ status: "VACANT\|OCCUPIED", activeCustomerName? }`    |
| `POST` | `/api/v1/public/tables/:number/session` | Inisialisasi sesi meja (Input Nama)  | `{ customerName }`                                                                                                            | `{ tableSessionToken, customerName }`                    |
| `POST` | `/api/v1/public/orders`                 | Buat pesanan baru dari cart          | `{ tableSessionToken, items: [{ menuItemId, quantity, notes?, selectedVariants: [{ groupName, optionName, extraPrice }] }] }` | `{ orderNumber, totalAmount, status: "PENDING" }`        |
| `GET`  | `/api/v1/public/orders/:orderNumber`    | Cek status pesanan meja              | `orderNumber` (path)                                                                                                          | Detail status pesanan (`PENDING`, `PREPARING`, `SERVED`) |

---

### 🔐 2. Auth Endpoints (JWT Admin Dual Token Strategy)

| Method | Endpoint                 | Description                                   | Payload Body / Header          | Response / Notes                      |
| :----- | :----------------------- | :-------------------------------------------- | :----------------------------- | :------------------------------------ |
| `POST` | `/api/v1/auth/handshake` | Pertukaran kunci / Inisialisasi sesi enkripsi | `{ clientPublicKey, nonce }`   | `{ serverPublicKey, handshakeToken }` |
| `POST` | `/api/v1/auth/login`     | Login admin restoran                          | `{ email, password }`          | `{ accessToken, refreshToken }`       |
| `POST` | `/api/v1/auth/refresh`   | Perbarui Access Token                         | `{ refreshToken }`             | `{ accessToken, refreshToken }`       |
| `POST` | `/api/v1/auth/logout`    | Revoke Refresh Token                          | Header: `Bearer <accessToken>` | `{ success: true }`                   |
| `GET`  | `/api/v1/auth/me`        | Cek profil admin                              | Header: `Bearer <accessToken>` | User object tanpa password            |

---

### 🔴 3. Admin Endpoints (Protected by JWT Guard)

Memerlukan header otentikasi: `Authorization: Bearer <accessToken>`

#### Promo Banner Management

| Method   | Endpoint                    | Description             | Payload Body (Zod DTO)                                                   |
| :------- | :-------------------------- | :---------------------- | :----------------------------------------------------------------------- |
| `GET`    | `/api/v1/admin/banners`     | List semua promo banner | -                                                                        |
| `POST`   | `/api/v1/admin/banners`     | Buat promo banner baru  | `{ title, description?, imageUrl, targetUrl?, sortOrder? }`              |
| `PATCH`  | `/api/v1/admin/banners/:id` | Edit promo banner       | `{ title?, description?, imageUrl?, targetUrl?, isActive?, sortOrder? }` |
| `DELETE` | `/api/v1/admin/banners/:id` | Hapus promo banner      | -                                                                        |

#### Category Management (Zod Schema Validated)

| Method   | Endpoint                       | Description          | Payload Body (Zod DTO)                  |
| :------- | :----------------------------- | :------------------- | :-------------------------------------- |
| `GET`    | `/api/v1/admin/categories`     | List semua kategori  | -                                       |
| `POST`   | `/api/v1/admin/categories`     | Tambah kategori baru | `{ name: string, sortOrder?: number }`  |
| `PATCH`  | `/api/v1/admin/categories/:id` | Edit kategori        | `{ name?: string, sortOrder?: number }` |
| `DELETE` | `/api/v1/admin/categories/:id` | Soft delete kategori | -                                       |

#### Menu Items & Variants Management (Zod Schema Validated)

| Method   | Endpoint                         | Description                           | Payload Body (Zod DTO)                                                                                             |
| :------- | :------------------------------- | :------------------------------------ | :----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/admin/menus`            | List semua menu (pagination & filter) | Params: `page`, `limit`, `search`                                                                                  |
| `POST`   | `/api/v1/admin/menus`            | Buat menu baru                        | `{ name, description?, price, promoPrice?, categoryId, imageUrl?, isBestSeller?, isRecommended?, variantGroups? }` |
| `PATCH`  | `/api/v1/admin/menus/:id`        | Edit data menu & variasi              | `{ name?, description?, price?, promoPrice?, isBestSeller?, isRecommended? }`                                      |
| `PATCH`  | `/api/v1/admin/menus/:id/status` | Fast toggle status ketersediaan       | `{ isAvailable: boolean }`                                                                                         |
| `DELETE` | `/api/v1/admin/menus/:id`        | Soft delete menu                      | -                                                                                                                  |

#### Table & Order CMS Management

| Method  | Endpoint                          | Description                         | Payload Body (Zod DTO)                             |
| :------ | :-------------------------------- | :---------------------------------- | :------------------------------------------------- |
| `GET`   | `/api/v1/admin/tables`            | List semua meja & statusnya         | -                                                  |
| `POST`  | `/api/v1/admin/tables`            | Tambah meja baru                    | `{ number: string }`                               |
| `POST`  | `/api/v1/admin/tables/:id/reset`  | Reset status meja menjadi `VACANT`  | -                                                  |
| `GET`   | `/api/v1/admin/orders`            | Monitor pesanan masuk (Live Orders) | Params: `status`, `tableNumber`                    |
| `PATCH` | `/api/v1/admin/orders/:id/status` | Update status pesanan (Dapur/Kasir) | `{ status: "PREPARING\|SERVED\|PAID\|CANCELLED" }` |

#### Revenue & Analytics Reports

| Method | Endpoint                            | Description                | Query Params           |
| :----- | :---------------------------------- | :------------------------- | :--------------------- |
| `GET`  | `/api/v1/admin/reports/revenue`     | Laporan pendapatan & omset | `startDate`, `endDate` |
| `GET`  | `/api/v1/admin/reports/top-selling` | Top menu paling laris      | `limit` (default: 5)   |

---

## 🗄️ Database Schema Blueprint (Prisma)

Tabel-tabel database yang sudah aktif di PostgreSQL `menuscan_db`:

- `User` (Admin Auth)
- `Category` (Kategori Menu)
- `MenuItem` (Detail Menu + Attributes rating, reviewCount, isBestSeller, isRecommended, promoPrice)
- `MenuItemVariantGroup` (Grup variasi: "Ukuran", "Extra Topping")
- `MenuItemVariantOption` (Opsi variasi: "Large (+5000)", "Extra Shot (+5000)")
- `PromoBanner` (Banner promo di homepage)
- `Table` (Manajemen Meja Restoran & Status)
- `Order` (Pesanan Pelanggan & CMS Tracking)
- `OrderItem` (Rincian Item Pesanan)
- `OrderItemVariant` (Snapshot variasi/extra pada pesanan)

## 📦 Planned Package Dependencies (NestJS)

- **Database**: `prisma`, `@prisma/client`
- **Auth Strategy**: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `@types/bcrypt`
- **Validation**: `zod`, `nestjs-zod`
- **Security & Enkripsi**: `node:crypto` (Native Node.js AES-256-GCM)
- **Config & Logging**: `@nestjs/config`, `nestjs-pino`, `pino-http`, `pino-roll`
- **Docs**: `@nestjs/swagger`, `swagger-ui-express`
