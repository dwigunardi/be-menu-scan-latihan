# Database & Query Strategy Specification

> **Project**: MenuScan – Digital QR Code Menu System  
> **Database Engine**: PostgreSQL  
> **ORM Framework**: Prisma ORM  
> **Target Goal**: High-Performance Read Operations for Public Menu & Secure Transactional Admin CRUD  
> **Document Location**: `docs/architecture/database-strategy.md`  

---

## 🎯 1. Overview & Principles

Sistem **MenuScan** dirancang untuk menangani rasio membaca-menulis (*Read-to-Write ratio*) sekitar **95:5** — di mana lalu lintas terbesar berasal dari pelanggan restoran yang terus-menerus membaca menu via QR Code, sementara akses menulis (*Write*) hanya dilakukan sesekali oleh Admin restoran.

Oleh karena itu, strategi database ini berfokus pada:
1. **Kecepatan Read Maksimal**: Melalui indeks komposit (*Composite Indexes*) dan eliminasi query N+1.
2. **Keamanan & Integritas Data**: Melalui *Soft Delete*, *Transactions*, dan *Hashed Refresh Token*.
3. **Optimasi I/O PostgreSQL**: Query yang efisien dengan pemisahan respons privat dan publik.

---

## 🗄️ 2. Detail Data Models & Schema Design

### A. Model `User` (Admin Restoran)
- Menyimpan kredensial login admin.
- Menyimpan hash `refreshToken` untuk mendukung strategi pembatalan sesi (*Session Revocation / Logout*).

### B. Model `Category` (Kategori Menu)
- Menyimpan pengelompokan menu (contoh: *Makanan Utama*, *Minuman*, *Dessert*).
- Memiliki kolom `slug` (unik) untuk URL friendly.
- Memiliki kolom `sortOrder` untuk mengatur urutan susunan kategori di tampilan layar HP pelanggan.
- Memiliki kolom `deletedAt` untuk mendukung strategi *Soft Delete*.

### C. Model `MenuItem` (Item Menu)
- Menyimpan detail nama, deskripsi, harga (`Decimal(10, 2)`), dan URL foto menu.
- Memiliki kolom `isAvailable` (boolean) untuk status ketersediaan (*Ready* / *Out of Stock*).
- Memiliki relasi *Foreign Key* ke `Category`.
- Memiliki kolom `deletedAt` untuk *Soft Delete*.

---

## ⚡ 3. Indexing Strategy & Optimalisasi Query

Untuk memastikan query publik berjalan pada kecepatan skala milidetik ($O(\log N)$ B-Tree Lookup), indeks berikut diterapkan secara eksplisit:

| Model | Indeks / Key | Tipe Indeks | Tujuan & Skenario Query |
| :--- | :--- | :--- | :--- |
| `User` | `email` | `UNIQUE` | Login Admin & Cek Email Unik |
| `Category` | `slug` | `UNIQUE` | Query detail kategori via URL slug |
| `MenuItem` | `[categoryId, isAvailable]` | `COMPOSITE` | **Filter Utama Public View**: Menampilkan menu aktif per kategori |
| `MenuItem` | `[categoryId, deletedAt]` | `COMPOSITE` | Filter admin untuk daftar menu aktif dalam kategori |
| `MenuItem` | `isAvailable` | `SINGLE` | Filter global menu yang tersedia |

---

## 🗑️ 4. Strategi Soft Delete (Keamanan Historis Data)

Data kategori dan menu **tidak pernah dihapus secara permanen (hard delete)** dari database PostgreSQL saat user menekan tombol Hapus di admin dashboard.

1. **Implementasi**:
   - Kolom `deletedAt DateTime?` bernilai `null` jika data masih aktif.
   - Saat admin menghapus data, `deletedAt` diisi dengan timestamp saat ini (`new Date()`).
2. **Klausul Filter Standar (Prisma Extension)**:
   - Query Public: `where: { deletedAt: null, isAvailable: true }`
   - Query Admin (Normal): `where: { deletedAt: null }`

---

## 🚫 5. Pencegahan Problem N+1 Query

Untuk menghindari pengiriman puluhan query SQL ke database saat menampilkan kategori beserta jumlah item menu di dalamnya:

```typescript
// ✅ 1 Single Query dengan Aggregate Count
const categories = await prisma.category.findMany({
  where: { deletedAt: null },
  orderBy: { sortOrder: 'asc' },
  select: {
    id: true,
    name: true,
    slug: true,
    sortOrder: true,
    _count: {
      select: {
        menuItems: {
          where: { isAvailable: true, deletedAt: null }
        }
      }
    }
  }
});
```

---

## 🔍 6. Pencarian & Pagination (Search & Offset)

### A. Pencarian Insensitif (`search`)
Pencarian teks menggunakan fitur PostgreSQL `mode: 'insensitive'` (ILIKE) pada kolom `name` dan `description`:
```typescript
where: {
  deletedAt: null,
  OR: [
    { name: { contains: searchQuery, mode: 'insensitive' } },
    { description: { contains: searchQuery, mode: 'insensitive' } }
  ]
}
```

### B. Pagination
- **Admin Table View**: Menggunakan **Offset-based Pagination** (`skip`, `take`) untuk navigasi halaman `page` & `limit`.
- **Public Menu View**: Menggunakan **Cursor-based Pagination** (`cursor`, `take`) jika daftar menu sangat besar untuk performa konstan.

---

## 🔄 7. Transaksi & ACID Guarantees

Setiap operasi yang melibatkan mutasi data pada lebih dari satu tabel (misal: penataan ulang `sortOrder` kategori secara berurutan) dibungkus menggunakan **Prisma Interactive Transaction**:

```typescript
await prisma.$transaction(async (tx) => {
  for (const item of categoryOrders) {
    await tx.category.update({
      where: { id: item.id },
      data: { sortOrder: item.sortOrder }
    });
  }
});
```

---

## ⏱️ 8. Slow Query Threshold Monitoring

Melalui `PrismaService` di NestJS, setiap query SQL yang membutuhkan waktu **> 500ms** akan secara otomatis mengirimkan log bertipe `WARN` dengan tag `step: "DATABASE_QUERY"`:

```typescript
// Threshold Warning pada Prisma Extension
if (executionTimeMs > 500) {
  logger.warn({
    step: 'DATABASE_QUERY',
    model,
    action,
    durationMs: executionTimeMs,
    msg: `SLOW QUERY DETECTED: Prisma ${action} took ${executionTimeMs}ms`
  });
}
```

---

## 🔗 9. Terhubung ke Dokumen Terkait

- 📄 Wireframe API & Blueprint Schema: [wireframe-api-not-final.md](file:///d:/code/be-menu-scan-latihan/docs/wireframe/wireframe-api-not-final.md)
- 📄 Arsitektur Utama Backend: [architecture-design.md](file:///d:/code/be-menu-scan-latihan/docs/architecture/architecture-design.md)
- 📄 Spesifikasi Logging: [logging-strategy.md](file:///d:/code/be-menu-scan-latihan/docs/architecture/logging-strategy.md)
