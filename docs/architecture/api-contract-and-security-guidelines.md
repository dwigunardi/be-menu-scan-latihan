# 🛡️ API Contract, Authentication & Hybrid Payload Encryption Guidelines

> **Repository**: `be-menu-scan-latihan` (Backend NestJS) & `fe-menu-scan-latihan` (Frontend Next.js)  
> **Status**: **Official Architectural Standard & Developer Guide**  
> **Target Audience**: Backend Engineers, Frontend Engineers, Full-Stack Developers, QA & Security Auditors

---

## 📑 Daftar Isi

1. [Ringkasan Eksekutif & Filosofi Desain](#1-ringkasan-eksekutif--filosofi-desain)
2. [Arsitektur 2 Layer: Autentikasi (JWT) vs Enkripsi Payload (`x-handshake-token`)](#2-arsitektur-2-layer-autentikasi-jwt-vs-enkripsi-payload-x-handshake-token)
3. [Alur Kriptografi ECDH & AES-256-GCM](#3-alur-kriptografi-ecdh--aes-256-gcm)
   - [A. Pertukaran Kunci ECDH Handshake](#a-pertukaran-kunci-ecdh-handshake)
   - [B. Inbound Request Decryption (`DecryptPayloadMiddleware`)](#b-inbound-request-decryption-decryptpayloadmiddleware)
   - [C. Outbound Response Encryption (`EncryptPayloadInterceptor`)](#c-outbound-response-encryption-encryptpayloadinterceptor)
   - [D. Pengecualian Khusus (`@SkipEncryption()`)](#d-pengecualian-khusus-skipencryption)
4. [Matriks Kontrak Seluruh API Endpoints](#4-matriks-kontrak-seluruh-api-endpoints)
   - [A. Katalog API Public (Guest / Pelanggan / QR Scan / Webhook)](#a-katalog-api-public-guest--pelanggan--qr-scan--webhook)
   - [B. Katalog API Protected / Admin / Staff](#b-katalog-api-protected--admin--staff)
5. [Panduan Langkah Demi Langkah Pembuatan Endpoint Baru (Developer Checklist)](#5-panduan-langkah-demi-langkah-pembuatan-endpoint-baru-developer-checklist)
6. [Anti-Patterns & Pitfalls yang Wajib Dihindari](#6-anti-patterns--pitfalls-yang-wajib-dihindari)

---

## 1. Ringkasan Eksekutif & Filosofi Desain

Sistem **MenuScan** dirancang dengan prinsip **Zero-Trust Transport Security** dan **Role-Based Access Control (RBAC)**. Dalam sistem ini:

1. **Payload Tidak Pernah Lewat dalam Plain-Text Terbuka** saat client (Frontend Web/Mobile) mengaktifkan sesi keamanan ECDH, bahkan untuk endpoint publik seperti katalog menu atau checkout pesanan.
2. **Kemandirian Dua Layer**:
   - **Layer 1: Autentikasi/Otorisasi (Siapa Anda?)** $\rightarrow$ Dikelola oleh **JWT** + **`RolesGuard`**.
   - **Layer 2: Keamanan Transport Data (Apakah data aman dari penyadapan?)** $\rightarrow$ Dikelola oleh **ECDH** + **AES-256-GCM** + **`x-handshake-token`**.
3. **Kompatibilitas Adaptif (Graceful Fallback)**:
   - Backend dapat melayani request terenkripsi maupun plain JSON standar secara dinamis berdasarkan keberadaan header `x-handshake-token`. Hal ini memudahkan debugging, automated tests, dan integrasi pihak ketiga tanpa mematikan fitur keamanan produksi.

---

## 2. Arsitektur 2 Layer: Autentikasi (JWT) vs Enkripsi Payload (`x-handshake-token`)

Berikut adalah diagram pipeline alur request dan response di NestJS:

```mermaid
flowchart TD
    Req[Inbound HTTP Request] --> Mid[DecryptPayloadMiddleware]
    
    subgraph "Layer 2: Transport Security (Inbound)"
        Mid --> HasToken1{Header x-handshake-token ada & body.encrypted == true?}
        HasToken1 -->|Ya| Decrypt[Dekripsi AES-256-GCM -> req.body JSON]
        HasToken1 -->|Tidak / Plain JSON| PassBody[Pass req.body langsung]
    end

    Decrypt --> Pipe[Global ZodValidationPipe]
    PassBody --> Pipe

    subgraph "Layer 1: Autentikasi & Otorisasi"
        Pipe --> GuardAuth{Route punya @Public()?}
        GuardAuth -->|Ya| AllowGuest[Bypass JWT Check]
        GuardAuth -->|Tidak (Default)| CheckJWT[JwtAuthGuard: Validasi Bearer Token]
        CheckJWT --> CheckRole[RolesGuard: Validasi UserRole]
    end

    AllowGuest --> Controller[Feature Controller & Service Execution]
    CheckRole --> Controller

    Controller --> InterceptorResp[TransformInterceptor: Standardize { data, meta }]

    subgraph "Layer 2: Transport Security (Outbound)"
        InterceptorResp --> HasSkip{Route punya @SkipEncryption()?}
        HasSkip -->|Ya| PlainResp[Kirim Plain JSON]
        HasSkip -->|Tidak| HasToken2{Header x-handshake-token ada?}
        HasToken2 -->|Ya| Encrypt[Enkripsi AES-256-GCM -> { encrypted: true, iv, tag, payload }]
        HasToken2 -->|Tidak| PlainResp
    end

    Encrypt --> FinalResp[Kirim HTTP Response]
    PlainResp --> FinalResp
```

### Penjelasan Kunci:
- **Default Backend adalah Private (Protected)**: Semua route tanpa `@Public()` secara otomatis membutuhkan JWT token yang valid.
- **Enkripsi Bersifat Universal**: Endpoint publik **TETAP DIENKRIPSI** jika request membawa `x-handshake-token`. Perbedaan antara endpoint public dan private **hanya terletak pada validasi token JWT**.

---

## 3. Alur Kriptografi ECDH & AES-256-GCM

### A. Pertukaran Kunci ECDH Handshake
Sebelum melakukan query data, frontend menginisiasi jabat tangan kriptografi:

1. Client men-generate ECDH Keypair (kurva `prime256v1` / `secp256k1`).
2. Client memanggil endpoint `POST /api/v1/auth/handshake` mengirimkan `clientPublicKey`.
3. Server men-generate keypair, menghitung shared secret, menghasilkan UUID `handshakeToken`, dan mengembalikan `serverPublicKey` serta `handshakeToken`.
4. Kedua belah pihak menurunkan **Derived AES-256 Session Key** menggunakan formula:
   $$\text{SessionKey} = \text{HKDF}(\text{ECDH Shared Secret}, \text{salt} = \text{APP\_SECRET})$$
5. `handshakeToken` disimpan di Redis (atau Memory fallback) selama 24 jam.

### B. Inbound Request Decryption (`DecryptPayloadMiddleware`)
Didaftarkan di [`src/app.module.ts`](file:///d:/code/be-menu-scan-latihan/src/app.module.ts#L68-L74) untuk semua route (`*`):
- Jika method adalah `GET` / `DELETE` atau URL adalah `/auth/handshake`, middleware langsung meneruskan (`next()`).
- Jika request body mengandung `{ encrypted: true, iv, tag, payload }`:
  - Wajib menyertakan header `x-handshake-token`. Jika tidak ada $\rightarrow$ `400 Bad Request`.
  - Mengambil session key dari `EcdhService` dan mendekripsi payload menjadi string JSON.
  - Mengganti `req.body` dengan objek JSON hasil dekripsi sehingga Controller menerima DTO normal.

### C. Outbound Response Encryption (`EncryptPayloadInterceptor`)
Didaftarkan secara global di [`src/main.ts`](file:///d:/code/be-menu-scan-latihan/src/main.ts#L72-L75):
- Mengecek metadata `@SkipEncryption()`. Jika ada $\rightarrow$ langsung kembalikan plain data.
- Jika request memiliki header `x-handshake-token`:
  - Mengambil session key dari `EcdhService`.
  - Mengenkripsi data menjadi format envelope:
    ```json
    {
      "encrypted": true,
      "iv": "base64-encoded-initialization-vector",
      "tag": "base64-encoded-auth-tag",
      "payload": "base64-encoded-ciphertext"
    }
    ```
- Jika tidak ada header `x-handshake-token` $\rightarrow$ mengembalikan plain data.
- Jika handler memakai `@ZodResponse(schema)`, schema diterapkan **sebelum** enkripsi (validasi + buang field yang tidak dideklarasikan). `TransformInterceptor` hanya melihat amplop terenkripsi, jadi hardening untuk respons terenkripsi harus terjadi di sini. Jika data tidak cocok dengan schema, backend mencatat `RESPONSE_SCHEMA_VALIDATION_WARNING` dan tetap mengirim data mentah.

### D. Pengecualian Khusus (`@SkipEncryption()`)
Hanya digunakan pada 2 kondisi:
1. **`POST /api/v1/auth/handshake`**: Endpoint pembentukan kunci publik (belum memiliki session key).
2. **`POST /api/v1/public/payments/webhook`**: Endpoint callback dari server Payment Gateway pihak ketiga (Midtrans/Xendit) yang mengirim payload JSON standar tanpa handshake token. Keamanannya bergantung pada signature `SHA512(orderNumber + grossAmount + PAYMENT_WEBHOOK_SECRET)` yang dibandingkan secara constant-time. `signatureKey: "test_bypass_key"` hanya diterima di luar production, dan di production aplikasi menolak start jika `PAYMENT_WEBHOOK_SECRET` masih nilai default dari repo.

---

## 4. Matriks Kontrak Seluruh API Endpoints

### A. Katalog API Public (Guest / Pelanggan / QR Scan / Webhook)
Endpoint ini **tidak memerlukan JWT** (menggunakan decorator `@Public()`).

| Modul | Method | Path | Fungsi & Kegunaan | Enkripsi Payload (`x-handshake-token`) |
| :--- | :---: | :--- | :--- | :---: |
| **Root** | `GET` | `/api/v1` | Health check server NestJS. | ✅ Didukung |
| **Auth** | `POST` | `/api/v1/auth/handshake` | Pertukaran kunci publik ECDH untuk membentuk session key. | ❌ **Bypass (`@SkipEncryption`)** |
| **Auth** | `POST` | `/api/v1/auth/login` | Login akun staf/admin dengan email & password. | ✅ Didukung *(Password terenkripsi)* |
| **Auth** | `POST` | `/api/v1/auth/refresh` | Perpanjangan Access Token dengan Refresh Token. | ✅ Didukung |
| **Categories** | `GET` | `/api/v1/public/categories` | Mengambil daftar kategori menu aktif (sortOrder asc). | ✅ Didukung |
| **Menus** | `GET` | `/api/v1/public/menus` | Mengambil katalog menu tersedia beserta varian & harga. | ✅ Didukung |
| **Menus** | `GET` | `/api/v1/public/menus/:id` | Mengambil detail 1 menu beserta grup varian opsional/wajib. | ✅ Didukung |
| **Banners** | `GET` | `/api/v1/public/banners` | Mengambil daftar promo banner carousel aktif. | ✅ Didukung |
| **Tables** | `GET` | `/api/v1/public/tables/:number/status` | Mengecek status meja saat pelanggan memindai QR code. | ✅ Didukung |
| **Tables** | `POST` | `/api/v1/public/tables/:number/session` | Memulai sesi meja pelanggan (input nama pelanggan). | ✅ Didukung *(Nama terenkripsi)* |
| **Orders** | `POST` | `/api/v1/public/orders` | Checkout keranjang pesanan pelanggan. | ✅ Didukung *(Keranjang terenkripsi)* |
| **Orders** | `GET` | `/api/v1/public/orders/:orderNumber` | Melacak status pesanan (`PENDING` $\rightarrow$ `PAID` $\rightarrow$ `PREPARING` $\rightarrow$ `SERVED`). | ✅ Didukung |
| **Payments** | `POST` | `/api/v1/public/payments/create-qris` | Membuat dynamic QRIS payload 15 menit untuk pembayaran. | ✅ Didukung |
| **Payments** | `POST` | `/api/v1/public/payments/webhook` | Menerima callback status pembayaran dari Midtrans/Xendit. | ❌ **Bypass (`@SkipEncryption`)** |
| **Settings** | `GET` | `/api/v1/public/branch/location` | Mengambil koordinat GPS kafe, geofence radius, & jam buka. | ✅ Didukung |

---

### B. Katalog API Protected / Admin / Staff
Endpoint ini **wajib menyertakan header `Authorization: Bearer <token>`** dan diverifikasi hak akses rolenya (`@Roles(...)`). Route `admin/*` tanpa `@Roles` **ditolak (`403`) secara default** oleh `RolesGuard`, jadi setiap route admin baru wajib menulis role-nya secara eksplisit. "All Roles" di tabel berarti `ADMIN`, `CASHIER`, `KITCHEN`, `WAITER`.

| Modul | Method | Path | Allowed Roles | Fungsi & Kegunaan |
| :--- | :---: | :--- | :--- | :--- |
| **Auth** | `POST` | `/api/v1/auth/logout` | All Roles | Revoke refresh token & clear session. |
| **Auth** | `GET` | `/api/v1/auth/me` | All Roles | Mengambil data profil staf yang sedang login. |
| **Auth** | `POST` | `/api/v1/auth/onboard` | All Roles *(Karantina)* | Aktivasi akun pertama kali (ganti password sementara, set 4-digit PIN, & flip `needsOnboarding: false`). |
| **Auth** | `POST` | `/api/v1/auth/verify-pin` | All Roles | Verifikasi PIN milik user JWT untuk keluar mode kiosk. `200 { valid }`, tidak pernah `401`; terkunci `429` setelah 5x salah (lockout dibagi dengan clock-in/out). |
| **Attendance** | `POST` | `/api/v1/admin/attendance/clock-in` | All Roles | Presensi masuk staf dengan verifikasi 4-digit PIN & geofence GPS. PIN terkunci $\rightarrow$ `429`. |
| **Attendance** | `POST` | `/api/v1/admin/attendance/clock-out` | All Roles | Presensi pulang staf; hitung durasi kerja dan menit lembur. PIN terkunci $\rightarrow$ `429`. |
| **Attendance** | `GET` | `/api/v1/admin/attendance` | `ADMIN` | Listing log presensi seluruh staf dengan filter & pagination. |
| **Attendance** | `GET` | `/api/v1/admin/attendance/summary` | `ADMIN` | KPI summary harian WIB (hadir, tepat waktu, telat, pulang awal, cuti, absen, % kehadiran). |
| **Attendance** | `POST` | `/api/v1/admin/attendance/leave` | `ADMIN` | Pengajuan izin / sakit resmi staf. |
| **Attendance** | `PATCH` | `/api/v1/admin/attendance/:id/overtime` | `ADMIN` | Review lembur: `APPROVED`, `REJECTED`, atau `OVERRIDDEN` dengan `approvedMinutes`. |
| **Attendance** | `PATCH` | `/api/v1/admin/attendance/:id/correction` | `ADMIN` | Koreksi jam pulang (`HH:mm` WIB atau ISO); durasi & lembur dihitung ulang. |
| **Shifts** | `GET` | `/api/v1/admin/shifts/current` | `ADMIN`, `CASHIER` | Shift kasir yang sedang terbuka beserta total live, atau `null`. |
| **Shifts** | `POST` | `/api/v1/admin/shifts/open` | `ADMIN`, `CASHIER` | Buka shift dengan modal kas awal. Satu shift terbuka per cabang (`409`). |
| **Shifts** | `POST` | `/api/v1/admin/shifts/:id/close` | `ADMIN`, `CASHIER` | Tutup shift + snapshot Z-Report. Hanya pembuka shift atau ADMIN (`403`). |
| **Shifts** | `GET` | `/api/v1/admin/shifts` | `ADMIN`, `CASHIER` | Riwayat shift terpaginasi, filter tanggal WIB & status. |
| **Staff** | `GET` | `/api/v1/admin/staff` | `ADMIN` | Listing seluruh staf dengan paginasi, search, dan role filter. |
| **Staff** | `GET` | `/api/v1/admin/staff/:id` | `ADMIN` | Detail data profil staf berdasarkan ID. |
| **Staff** | `POST` | `/api/v1/admin/staff` | `ADMIN` | Menambahkan akun staf baru beserta role & PIN. |
| **Staff** | `PUT` | `/api/v1/admin/staff/:id` | `ADMIN` | Memperbarui nama, email, phone, role, dan status aktif staf. |
| **Staff** | `PUT` | `/api/v1/admin/staff/:id/pin` | `ADMIN` | Mengatur / mereset 4-digit PIN presensi staf. |
| **Staff** | `DELETE`| `/api/v1/admin/staff/:id` | `ADMIN` | Deaktivasi / soft delete akun staf. |
| **Settings** | `GET` | `/api/v1/admin/settings/branch` | All Roles | Mengambil pengaturan lengkap cabang, GPS, dan jam kerja. |
| **Settings** | `PUT` | `/api/v1/admin/settings/branch` | `ADMIN` | Mengubah koordinat GPS, radius geofence, & toleransi keterlambatan. |
| **Settings** | `PUT` | `/api/v1/admin/settings/branch/store-status` | `ADMIN`, `CASHIER` | Fast toggle status operasional toko (Open / Closed / Emergency). |
| **Settings** | `GET` | `/api/v1/admin/settings/shift-templates` | All Roles | Mengambil master jadwal template shift (Pagi, Middle, Sore). |
| **Settings** | `POST`| `/api/v1/admin/settings/shift-templates` | `ADMIN` | Menambahkan template shift baru. |
| **Settings** | `PUT` | `/api/v1/admin/settings/shift-templates/:id` | `ADMIN` | Mengedit jam mulai, jam selesai, atau badge template shift. |
| **Settings** | `DELETE`| `/api/v1/admin/settings/shift-templates/:id` | `ADMIN` | Menghapus template shift. |
| **Settings** | `POST`| `/api/v1/admin/settings/shift-templates/seed-defaults` | `ADMIN` | Auto-seed 3 template shift default yang sinkron dengan jam buka toko. |
| **Menus** | `GET` | `/api/v1/admin/menus` | `ADMIN`, `CASHIER`, `KITCHEN` | Listing menu CMS terpaginasi dengan data varian lengkap. |
| **Menus** | `POST`| `/api/v1/admin/menus` | `ADMIN` | Membuat menu baru beserta grup varian bertingkat. |
| **Menus** | `PUT` | `/api/v1/admin/menus/:id` | `ADMIN` | Memperbarui menu dan atomic replacement grup varian. |
| **Menus** | `PUT` | `/api/v1/admin/menus/:id/status` | `ADMIN`, `CASHIER`, `KITCHEN` | 1-Click fast toggle ketersediaan stok menu (`isAvailable`). |
| **Menus** | `DELETE`| `/api/v1/admin/menus/:id` | `ADMIN` | Soft delete menu item. |
| **Categories**| `GET` | `/api/v1/admin/categories` | `ADMIN` | Listing kategori CMS dengan jumlah relasi menu. |
| **Categories**| `POST`| `/api/v1/admin/categories` | `ADMIN` | Membuat kategori menu baru dengan auto slug. |
| **Categories**| `PUT` | `/api/v1/admin/categories/reorder` | `ADMIN` | Batch update urutan sorting kategori (`sortOrder`). |
| **Categories**| `PUT` | `/api/v1/admin/categories/:id` | `ADMIN` | Mengubah nama atau slug kategori. |
| **Categories**| `DELETE`| `/api/v1/admin/categories/:id` | `ADMIN` | Soft delete kategori (validasi tidak ada menu aktif). |
| **Tables** | `GET` | `/api/v1/admin/tables` | `ADMIN`, `CASHIER`, `WAITER` | Listing meja floor plan beserta status sesi aktif. |
| **Tables** | `POST`| `/api/v1/admin/tables` | `ADMIN` | Menambahkan nomor meja dan kapasitas kursi baru. |
| **Tables** | `PUT` | `/api/v1/admin/tables/:id` | `ADMIN` | Mengubah konfigurasi meja, tipe kursi, dan zona. |
| **Tables** | `POST`| `/api/v1/admin/tables/:id/reset` | `ADMIN`, `CASHIER`, `WAITER` | Reset sesi meja menjadi `VACANT` setelah dibersihkan. |
| **Tables** | `DELETE`| `/api/v1/admin/tables/:id` | `ADMIN` | Menghapus meja dari sistem. |
| **Table Zones**| `GET` | `/api/v1/admin/table-zones` | All Roles | Listing zona meja beserta metrik kapasitas & okupansi. |
| **Table Zones**| `POST`| `/api/v1/admin/table-zones` | `ADMIN` | Membuat zona meja baru (misal: Indoor AC, Outdoor). |
| **Table Zones**| `PUT` | `/api/v1/admin/table-zones/:id` | `ADMIN` | Memperbarui nama, deskripsi, warna badge, & sort order zona. |
| **Table Zones**| `DELETE`| `/api/v1/admin/table-zones/:id` | `ADMIN` | Menghapus zona meja (otomatis unbind meja terkait). |
| **Orders** | `GET` | `/api/v1/admin/orders` | All Roles | Live KDS / POS order monitoring terpaginasi dengan filter status. |
| **Orders** | `PUT` / `PATCH` | `/api/v1/admin/orders/:id/status` | All Roles *(PAID & CANCELLED: `ADMIN`, `CASHIER`)* | Update status pesanan. `PAID` lewat satu pintu pembayaran (`paymentMethod?` `CASH` \| `QRIS`, tunai wajib ada shift terbuka $\rightarrow$ `409` `code: SHIFT_NOT_OPEN`). KITCHEN/WAITER ke `PAID`/`CANCELLED` $\rightarrow$ `403`. |
| **Reports** | `GET` | `/api/v1/admin/reports/dashboard-overview` | `ADMIN` | Ringkasan metrik dashboard eksekutif (omset, transaksi, meja aktif). |
| **Reports** | `GET` | `/api/v1/admin/reports/revenue` | `ADMIN` | Laporan analitik pendapatan terperinci berdasarkan rentang tanggal. |
| **Reports** | `GET` | `/api/v1/admin/reports/top-selling` | `ADMIN` | Laporan menu terlaris (*best-selling*) dan kontribusi profit. |
| **Banners** | `GET` | `/api/v1/admin/banners` | `ADMIN` | Listing seluruh promo banner (termasuk non-aktif). |
| **Banners** | `POST`| `/api/v1/admin/banners` | `ADMIN` | Menambahkan banner promo baru. |
| **Banners** | `PUT` | `/api/v1/admin/banners/:id` | `ADMIN` | Mengupdate foto, target link, sort order, & status aktif banner. |
| **Banners** | `DELETE`| `/api/v1/admin/banners/:id` | `ADMIN` | Menghapus banner promo. |
| **Uploads** | `POST`| `/api/v1/admin/uploads/image` | `ADMIN` | Upload foto (Sharp sanitasi, kompresi WebP, & simpan ke disk). |

---

## 5. Panduan Langkah Demi Langkah Pembuatan Endpoint Baru (Developer Checklist)

Setiap engineer Backend yang menambahkan fitur atau endpoint baru **WAJIB** mengikuti 6 langkah baku berikut:

### Langkah 1: Tentukan Schema & DTO dengan Zod v4 Standards
Gunakan `createZodDto` dari `nestjs-zod`. Selalu gunakan standar top-level Zod v4 (`z.email()`, `z.uuid()`, `z.iso.datetime()`):
```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateExampleSchema = z.object({
  name: z.string().min(3, 'Nama minimal 3 karakter'),
  email: z.email('Format email tidak valid'),
  amount: z.coerce.number().positive(),
});

export class CreateExampleDto extends createZodDto(CreateExampleSchema) {}
```

### Langkah 2: Tentukan Level Hak Akses (Public vs Protected)
- **Jika Endpoint Public (Bisa diakses tanpa login)**: Tambahkan decorator `@Public()` dari `src/common/decorators/public.decorator.ts`.
- **Jika Endpoint Protected (Wajib Login)**: Jangan tambahkan `@Public()`. Tambahkan `@Roles(UserRole.ADMIN, ...)` untuk membatasi role yang diizinkan. Untuk route `admin/*`, `@Roles` **wajib**: tanpa itu `RolesGuard` menolak semua request (`403`). Jika memang semua role boleh, tulis keempat role secara eksplisit.

```typescript
// Contoh Endpoint Public
@Public()
@Get('public/example')
async getPublicExample() { ... }

// Contoh Endpoint Protected Admin
@Roles(UserRole.ADMIN)
@Post('admin/example')
async createAdminExample(@Body() dto: CreateExampleDto) { ... }
```

### Langkah 3: Perlakuan Enkripsi Payload
- **Default (99% Endpoint)**: **JANGAN** tambahkan decorator apapun terkait enkripsi. `EncryptPayloadInterceptor` dan `DecryptPayloadMiddleware` akan bekerja otomatis secara global saat client menyertakan `x-handshake-token`.
- **Kasus Khusus**: Hanya tambahkan `@SkipEncryption()` jika endpoint dipanggil oleh webhook pihak ketiga (seperti Payment Gateway) atau pertukaran kunci awal.

### Langkah 4: Standarisasi Format Respon
- Jangan membungkus return data dengan `{ data: ... }` secara manual di controller jika service sudah mengembalikan data murni, karena `TransformInterceptor` akan membungkusnya secara otomatis.
- Untuk query terpaginasi, selalu gunakan helper `createPaginatedResult(items, total, page, limit)` yang menghasilkan format standar: `{ items: T[], meta: PaginationMeta }`.

### Langkah 5: Dokumentasi Swagger OpenAPI
Lengkapi controller method dengan decorator Swagger:
```typescript
@ApiOperation({ summary: 'Deskripsi ringkas endpoint' })
@ApiResponse({ status: 200, description: 'Operasi berhasil' })
@ApiResponse({ status: 400, description: 'Validasi input gagal' })
```

### Langkah 6: Wajib Menyertakan Unit Test (100% Coverage Target)
Buat file `*.service.spec.ts` dan `*.controller.spec.ts` untuk menguji:
1. Skenario sukses (Happy path).
2. Skenario validasi gagal / exception (`NotFoundException`, `ConflictException`, `BadRequestException`).
3. Verifikasi panggilan dependency (Prisma mock).
4. Jalankan `npm run test:cov` untuk memastikan test pass 100%.

---

## 6. Anti-Patterns & Pitfalls yang Wajib Dihindari

> [!WARNING]
> **Daftar Kesalahan Fatal yang Sering Terjadi**:

1. ❌ **Menulis URL Dobel di Frontend (`/api/v1/api/v1/...`)**:
   - `BASE_URL` di Frontend API helper **TIDAK BOLEH** diawali `/api/v1/` karena `hardenedFetch` / `apiClient` sudah memiliki base prefix `/api/v1`.
   - **Benar**: `const BASE_URL = '/admin/attendance';`
   - **Salah**: `const BASE_URL = '/api/v1/admin/attendance';`

2. ❌ **Menganggap API Public Tidak Bisa Dienkripsi**:
   - Jangan berasumsi bahwa enkripsi hanya untuk endpoint Admin. Pelanggan saat scan QR meja dan checkout pesanan juga mengirimkan data sensitif (nama, pesanan, nomor meja) yang terlindungi enkripsi jika `x-handshake-token` dikirimkan.

3. ❌ **Lupa Menambahkan `@Public()` pada Endpoint Tamu**:
   - Karena guard backend default-nya adalah **Private**, jika Anda lupa menaruh `@Public()`, endpoint tamu akan menolak request dengan `401 Unauthorized`.

4. ❌ **Memodifikasi Request Body Manual tanpa DTO**:
   - Selalu gunakan DTO berbasis `createZodDto` agar payload tervalidasi ketat oleh `ZodValidationPipe`.

5. ❌ **Menggunakan Schema Zod yang Deprecated**:
   - Gunakan format Zod v4 top-level (`z.email()`, `z.uuid()`, `z.iso.datetime()`) bukan format v3 (`z.string().email()`, `z.string().uuid()`).
