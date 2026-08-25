# Blueprint & Spesifikasi Smart Absensi & Manajemen Karyawan (Backend Perspective)

> **Project**: MenuScan – Digital QR Code Menu System & Multi-Branch FnB SaaS  
> **Backend Architecture**: NestJS 11 + TypeScript + PostgreSQL / Prisma ORM  
> **Document Location**: `docs/be/architecture/staff-and-attendance-blueprint.md`  
> **Status**: APPROVED TECHNICAL BLUEPRINT  

---

## 🎯 1. Overview Arsitektur Backend

Modul ini bertanggung jawab atas integritas data karyawan, otentikasi PIN 4-digit cepat, validasi jarak geofencing GPS $(\le 100\text{m})$, kalkulasi otomatis status keterlambatan (*Late Detection*), serta pencatatan durasi kerja harian.

---

## 🗄️ 2. Skema Database Prisma (`schema.prisma`)

```prisma
model User {
  id               String       @id @default(uuid())
  email            String       @unique
  password         String
  name             String
  phone            String?
  role             Role         @default(CASHIER) // ADMIN | CASHIER | KITCHEN | WAITER
  pinCode          String?      // Hashed 4-digit PIN untuk quick clock-in
  dailyShiftHours  Int          @default(8)       // Standar jam kerja per hari
  isActive         Boolean      @default(true)
  joinedAt         DateTime     @default(now())
  attendances      Attendance[]
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@index([role, isActive])
}

model BranchSettings {
  id                    String   @id @default("default")
  branchName            String   @default("Kumpul Cafe")
  latitude              Float    @default(-6.200000)  // Koordinat GPS Cabang Kafe
  longitude             Float    @default(106.816666)
  maxAttendanceRadius   Int      @default(100)        // Maksimal jarak radius absen (meter)
  shiftToleranceMinutes Int      @default(15)         // Toleransi telat (menit)
  updatedAt             DateTime @updatedAt
}

model Attendance {
  id                    String           @id @default(uuid())
  userId                String
  user                  User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  branchId              String           @default("default-branch")
  date                  String           // Format 'YYYY-MM-DD'
  clockInTime           DateTime?
  clockOutTime          DateTime?
  workDurationMinutes   Int?             // Dihitung otomatis saat clock-out
  status                AttendanceStatus @default(PRESENT)
  clockInLatitude       Float?
  clockInLongitude      Float?
  clockInDistanceMeters Float?          // Jarak fisik saat absen (meter)
  isWithinRadius        Boolean          @default(true)
  notes                 String?
  attachmentUrl         String?          // Foto surat dokter jika sakit
  approvedById          String?          // ID Manager yang menyetujui izin/sakit
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  @@unique([userId, date])              // 1 karyawan max 1 log per tanggal
  @@index([branchId, date])
  @@index([status])
}

enum AttendanceStatus {
  PRESENT      // Hadir tepat waktu
  LATE         // Terlambat (>15 menit dari jam masuk)
  SICK         // Sakit
  PERMISSION   // Izin keperluan mendesak
  LEAVE        // Cuti
  ALPHA        // Tanpa Keterangan
}
```

---

## 🔌 3. Spesifikasi Endpoint REST API

### A. Sisi Staf (Self-Service)
| Endpoint | Method | Role | Payload Request | Deskripsi |
| :--- | :---: | :---: | :--- | :--- |
| `/api/v1/staff/attendance/today` | `GET` | `ALL_STAFF` | - | Ambil status absensi saya hari ini |
| `/api/v1/staff/attendance/clock-in` | `POST` | `ALL_STAFF` | `{ pinCode, latitude, longitude }` | Clock-in dengan validasi PIN & jarak $\le 100\text{m}$ |
| `/api/v1/staff/attendance/clock-out` | `POST` | `ALL_STAFF` | `{ pinCode, latitude, longitude }` | Clock-out & hitung durasi kerja |
| `/api/v1/staff/attendance/leave-request` | `POST` | `ALL_STAFF` | `{ type, date, notes, attachmentUrl }` | Ajukan Izin / Sakit / Cuti |

### B. Sisi Admin / Supervisor
| Endpoint | Method | Role | Payload Request | Deskripsi |
| :--- | :---: | :---: | :--- | :--- |
| `/api/v1/admin/staff` | `GET` | `ADMIN` | Query: `role`, `search`, `page`, `limit` | Daftar seluruh akun staf |
| `/api/v1/admin/staff` | `POST` | `ADMIN` | `{ name, email, role, password, pinCode, phone }` | Buat akun staf baru |
| `/api/v1/admin/staff/:id` | `PUT` | `ADMIN` | `{ name, email, role, phone, isActive }` | Edit profil staf |
| `/api/v1/admin/staff/:id/pin` | `PUT` | `ADMIN` | `{ pinCode }` | Set/Reset PIN 4-digit staf |
| `/api/v1/admin/staff/:id` | `DELETE` | `ADMIN` | - | Deaktivasi akun staf |
| `/api/v1/admin/attendance/overview` | `GET` | `ADMIN` | - | Summary KPI hadir hari ini |
| `/api/v1/admin/attendance/logs` | `GET` | `ADMIN` | Query: `startDate`, `endDate`, `status`, `role` | Audit log lengkap seluruh staf |
| `/api/v1/admin/attendance/:id/approve` | `PUT` | `ADMIN` | `{ isApproved: boolean, notes }` | Setujui/Tolak pengajuan izin |

---

## 🧮 4. Business Logic & Rumus Kalkulasi Backend

1. **Haversine Distance Check (Geofence Validation)**:
   ```typescript
   function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
     const R = 6371e3; // Radius bumi dalam meter
     const phi1 = (lat1 * Math.PI) / 180;
     const phi2 = (lat2 * Math.PI) / 180;
     const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
     const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

     const a =
       Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
       Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

     return R * c; // Hasil dalam meter
   }
   ```
   - Jika `distance > branchSettings.maxAttendanceRadius` (100m) $\rightarrow$ Throw `400 Bad Request` (*"Lokasi berada di luar radius kafe"*).

2. **Deteksi Status Terlambat (Late Status)**:
   - Jika waktu Clock-In melewati batas jam masuk shift + toleransi (15 menit) $\rightarrow$ `status = AttendanceStatus.LATE`.
