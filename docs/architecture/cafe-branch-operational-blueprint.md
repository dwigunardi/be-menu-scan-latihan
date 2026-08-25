# Blueprint & Spesifikasi Operasional Cabang Kafe (Backend Perspective)

> **Project**: Kumpul Cafe – Digital QR Code Menu & Multi-Branch FnB SaaS  
> **Backend Architecture**: NestJS 11 + TypeScript + PostgreSQL / Prisma  
> **Document Location**: `docs/be/architecture/cafe-branch-operational-blueprint.md`  
> **Status**: APPROVED ARCHITECTURE BLUEPRINT  

---

## 🎯 1. Backend Executive Summary

Dokumen ini mendefinisikan rancangan struktur database, skema API, dan aturan bisnis (*business logic*) backend untuk mendukung operasional fisik cabang kafe secara akurat, aman, dan dapat diaudit (*audit-compliant*).

---

## 🗄️ 2. Database Schema Extensions

### A. Model `Shift` (Manajemen Kas & Kasir Shift)
```prisma
model Shift {
  id              String      @id @default(uuid())
  branchId        String      @default("default-branch")
  staffId         String
  staffName       String
  openingCash     Decimal     @db.Decimal(12, 2) // Kas modal awal
  expectedCash    Decimal     @default(0) @db.Decimal(12, 2) // Kas awal + total order tunai
  actualCash      Decimal?    @db.Decimal(12, 2) // Uang fisik dihitung kasir saat tutup
  cashVariance    Decimal?    @db.Decimal(12, 2) // Selisih kas (actual - expected)
  totalCashOrders Int         @default(0)
  totalQrisOrders Int         @default(0)
  totalRevenue    Decimal     @default(0) @db.Decimal(12, 2)
  status          ShiftStatus @default(OPEN) // OPEN | CLOSED
  notes           String?
  openedAt        DateTime    @default(now())
  closedAt        DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([branchId, status])
  @@index([staffId])
}

enum ShiftStatus {
  OPEN
  CLOSED
}
```

### B. Extension Model `Order` (Payment Method & Tax / Service Breakdown)
```prisma
enum PaymentMethod {
  QRIS
  CASH
  DEBIT
  TRANSFER
}

// Tambahan field pada model Order
model Order {
  // ... field eksisting ...
  paymentMethod  PaymentMethod @default(QRIS)
  subtotalAmount Decimal       @db.Decimal(12, 2)
  taxAmount      Decimal       @default(0) @db.Decimal(12, 2) // PB1 (misal 10%)
  serviceAmount  Decimal       @default(0) @db.Decimal(12, 2) // Service Fee (misal 5%)
  discountAmount Decimal       @default(0) @db.Decimal(12, 2)
  totalAmount    Decimal       @db.Decimal(12, 2)
  shiftId        String?       // Relasi ke shift kasir aktif
}
```

### C. Model `BranchSettings` (Pengaturan Pajak, WiFi, & Struk)
```prisma
model BranchSettings {
  id                 String   @id @default("default")
  branchName         String   @default("Kumpul Cafe")
  address            String?
  phoneNumber        String?
  taxRatePercent     Decimal  @default(10.0) @db.Decimal(5, 2) // Pajak PB1 %
  serviceFeePercent  Decimal  @default(0.0) @db.Decimal(5, 2)  // Service Fee %
  isTaxInclusive     Boolean  @default(true)                   // True = harga di menu sudah nett
  receiptHeaderNote  String?  @default("Selamat Menikmati Kopi & Hidangan!")
  receiptFooterNote  String?  @default("Password WiFi: kopienak123\nFollow IG @kumpulcafe")
  updatedAt          DateTime @updatedAt
}
```

---

## 🔌 3. Endpoint API Spesifikasi (REST API)

### A. Rekonsiliasi Pembayaran & Laporan
#### `GET /api/v1/admin/reports/revenue`
* **Query Params**: `startDate`, `endDate`, `paymentMethod` (optional)
* **Response Extension**:
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "totalRevenue": 660000,
    "totalOrders": 9,
    "averageOrderValue": 73333.33,
    "paymentBreakdown": [
      { "method": "QRIS", "totalAmount": 450000, "orderCount": 6, "percentage": 68.2 },
      { "method": "CASH", "totalAmount": 210000, "orderCount": 3, "percentage": 31.8 }
    ],
    "ordersByStatus": [
      { "status": "PAID", "count": 9 },
      { "status": "CANCELLED", "count": 1 }
    ]
  }
}
```

### B. Shift Kasir & Tutup Buku (Z-Report)
| Endpoint | Method | Role | Deskripsi |
| :--- | :---: | :---: | :--- |
| `/api/v1/admin/shifts/open` | `POST` | `CASHIER`, `ADMIN` | Buka shift baru dengan `openingCash` |
| `/api/v1/admin/shifts/current` | `GET` | `CASHIER`, `ADMIN` | Ambil status shift aktif & ringkasan kas saat ini |
| `/api/v1/admin/shifts/close` | `POST` | `CASHIER`, `ADMIN` | Tutup shift, hitung selisih kas & terbitkan Z-Report |
| `/api/v1/admin/shifts` | `GET` | `ADMIN` | Riwayat log shift kasir dengan paginasi & filter tanggal |

### C. Manajemen Staf Cabang
| Endpoint | Method | Role | Deskripsi |
| :--- | :---: | :---: | :--- |
| `/api/v1/admin/staff` | `GET` | `ADMIN` | Daftar semua akun staf cabang (Kasir, Chef, Pelayan) |
| `/api/v1/admin/staff` | `POST` | `ADMIN` | Buat akun staf baru (`name`, `email`, `role`, `password`) |
| `/api/v1/admin/staff/:id` | `PUT` | `ADMIN` | Edit data staf & toggle aktif/nonaktif |
| `/api/v1/admin/staff/:id/password` | `PUT` | `ADMIN` | Reset password/PIN staf |
| `/api/v1/admin/staff/:id` | `DELETE` | `ADMIN` | Hapus akun staf |

### D. Pengaturan Cabang & Struk
| Endpoint | Method | Role | Deskripsi |
| :--- | :---: | :---: | :--- |
| `/api/v1/admin/settings` | `GET` | `ADMIN`, `CASHIER` | Ambil konfigurasi pajak, WiFi, dan footer struk |
| `/api/v1/admin/settings` | `PUT` | `ADMIN` | Update konfigurasi cabang |

---

## 🧮 4. Business Logic & Aturan Rekonsiliasi Finansial

1. **Kalkulasi Selisih Kas Shift (Cash Variance)**:
   $$\text{Expected Cash} = \text{Opening Cash} + \sum \text{Orders (Status: PAID, Method: CASH)}$$
   $$\text{Cash Variance} = \text{Actual Cash (Diinput Kasir)} - \text{Expected Cash}$$
   - Jika $\text{Variance} = 0$: **Kas Sempurna / Klop**.
   - Jika $\text{Variance} < 0$: **Kas Kurang (Shortage)** $\rightarrow$ flag peringatan audit.
   - Jika $\text{Variance} > 0$: **Kas Lebih (Overage)**.

2. **Kalkulasi Pajak PB1 & Service Fee**:
   - Jika `isTaxInclusive = true`:
     $$\text{Nett Subtotal} = \frac{\text{Total}}{1 + \text{Tax Rate} + \text{Service Rate}}$$
     $$\text{Tax Amount} = \text{Nett Subtotal} \times \text{Tax Rate}$$
   - Jika `isTaxInclusive = false`:
     $$\text{Tax Amount} = \text{Subtotal} \times \text{Tax Rate}$$
     $$\text{Total} = \text{Subtotal} + \text{Tax Amount} + \text{Service Amount}$$
