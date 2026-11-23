# Blueprint & Spesifikasi Smart Absensi & Manajemen Karyawan (Backend Perspective)

> **Project**: MenuScan – Digital QR Code Menu System & Multi-Branch FnB SaaS  
> **Backend Architecture**: NestJS 11 + TypeScript + PostgreSQL / Prisma ORM  
> **Document Location**: `docs/be/architecture/staff-and-attendance-blueprint.md`  
> **Status**: APPROVED TECHNICAL BLUEPRINT (bagian 2–4 disinkronkan dengan kode 2026-11-23)  

---

## 🎯 1. Overview Arsitektur Backend

Modul ini bertanggung jawab atas integritas data karyawan, otentikasi PIN 4-digit cepat, validasi jarak geofencing GPS $(\le 100\text{m})$, kalkulasi otomatis status keterlambatan (*Late Detection*), serta pencatatan durasi kerja harian.

---

## 🗄️ 2. Skema Database Prisma (`schema.prisma`)

> Disinkronkan dengan kode pada 2026-11-23. Sumber kebenaran: `prisma/schema.prisma`. Kutipan di bawah hanya field yang relevan untuk presensi.

```prisma
model User {
  id                String    @id @default(uuid())
  employeeId        String?   @unique @map("employee_id")
  email             String    @unique
  name              String
  role              UserRole  @default(ADMIN)            // ADMIN | CASHIER | KITCHEN | WAITER
  pinCode           String?   @map("pin_code")           // Hash bcrypt PIN 4-digit
  pinFailedAttempts Int       @default(0)                // PIN salah berturut-turut (verify-pin, clock-in, clock-out)
  pinLockedUntil    DateTime?                            // PIN ditolak (429) sampai waktu ini
  dailyShiftHours   Int       @default(8)                // Jam kerja standar; dasar perhitungan lembur
  isActive          Boolean   @default(true)
  needsOnboarding   Boolean   @default(true)
  // ...
}

model BranchSetting {
  latitude        Float                                  // Koordinat GPS cabang
  longitude       Float
  geofenceRadius  Int     @default(100)                  // Radius presensi (meter)
  openTime        String  @default("08:00")              // Jam buka, jam dinding WIB
  lateGracePeriod Int     @default(15)                   // Toleransi terlambat (menit)
  // ...
}

model Attendance {
  id                      String                @id @default(uuid())
  branchId                String                @default("default-branch")
  staffId                 String                                  // Relasi "AttendanceStaff" ke User
  date                    String                                  // 'YYYY-MM-DD', tanggal WIB
  clockInTime             DateTime?
  clockOutTime            DateTime?
  status                  AttendanceStatus      @default(ON_TIME)
  clockInLat              Float?
  clockInLon              Float?
  clockInDistanceMeters   Float?
  isWithinGeofence        Boolean               @default(true)
  workDurationMinutes     Int?                                    // Dihitung saat clock-out / koreksi
  overtimeMinutes         Int?                                    // Kelebihan atas dailyShiftHours
  overtimeReviewStatus    OvertimeReviewStatus?                   // null = menunggu review
  approvedOvertimeMinutes Int?
  overtimeReviewedById    String?
  overtimeReviewedAt      DateTime?
  overtimeNotes           String?
  correctedById           String?                                 // Jejak audit koreksi jam pulang
  correctedAt             DateTime?
  correctionNotes         String?
  originalClockOutTime    DateTime?                               // Jam pulang sebelum koreksi pertama
  notes                   String?
  leaveType               LeaveType?
  leaveStatus             LeaveStatus?
  leaveReason             String?

  @@unique([staffId, date])                                       // 1 staf maks. 1 log per tanggal
  @@index([branchId, date])
  @@index([status])
}

enum AttendanceStatus {
  ON_TIME      // Masuk sebelum openTime + lateGracePeriod
  LATE         // Masuk setelah batas toleransi
  EARLY_LEAVE  // Belum dipakai oleh logika backend
  COMPLETED    // ON_TIME yang sudah presensi pulang
  SICK
  LEAVE
  ABSENT
}

enum OvertimeReviewStatus {
  APPROVED   // Menit hasil hitung disetujui
  REJECTED   // 0 menit
  OVERRIDDEN // Admin menetapkan jumlah menit sendiri
}

enum LeaveType {
  SICK
  ANNUAL_LEAVE
  URGENT_MATTER
  OTHER
}
```

Pengajuan izin disimpan di model terpisah `LeaveRequest` (`staffId`, `leaveType`, `startDate`, `endDate`, `reason`, `status`). Jika rentangnya mencakup hari ini, presensi hari ini ikut ditandai `SICK` atau `LEAVE`.

---

## 🔌 3. Spesifikasi Endpoint REST API

Semua endpoint presensi berada di bawah `/api/v1/admin/attendance` dan mengembalikan bentuk `AttendanceItem` FE (`staffName`, `staffRole`, waktu dalam ISO datetime UTC). Tidak ada endpoint self-service `/staff/attendance/*`: presensi dilakukan di tablet kiosk yang login sebagai staf mana pun, dan identitas staf dibuktikan dengan PIN miliknya.

### A. Kiosk Presensi (semua role)
| Endpoint | Method | Role | Payload Request | Deskripsi |
| :--- | :---: | :---: | :--- | :--- |
| `/api/v1/admin/attendance/kiosk-roster` | `GET` | `ADMIN`, `CASHIER` | - | Daftar staf aktif yang sudah onboarding (termasuk ADMIN) untuk grid kiosk: `[{ id, employeeId, name, role, avatarUrl, hasPin, today: null | { attendanceId, clockInTime, clockOutTime, status } }]`. Tanpa email/telepon. |
| `/api/v1/admin/attendance/clock-in` | `POST` | `ADMIN`, `CASHIER`, `KITCHEN`, `WAITER` | `{ staffId, pinCode, latitude, longitude, notes? }` | Clock-in dengan verifikasi PIN dan geofence |
| `/api/v1/admin/attendance/clock-out` | `POST` | `ADMIN`, `CASHIER`, `KITCHEN`, `WAITER` | `{ staffId, pinCode, latitude, longitude, notes? }` | Clock-out, hitung durasi kerja dan lembur |

Throttle 5 request/menit per IP. PIN salah dibalas `400`; PIN terkunci dibalas `429` (lihat bagian 4).

### B. Admin
| Endpoint | Method | Role | Payload Request | Deskripsi |
| :--- | :---: | :---: | :--- | :--- |
| `/api/v1/admin/attendance` | `GET` | `ADMIN` | Query: `page`, `limit`, `startDate`, `endDate`, `status`, `role`, `search` | Log presensi terpaginasi `{ items, meta }` |
| `/api/v1/admin/attendance/summary` | `GET` | `ADMIN` | Query: `date?` (default hari ini WIB) | `{ date, totalStaff, presentCount, onTimeCount, lateCount, earlyLeaveCount, leaveCount, absentCount, attendanceRatePercent }` |
| `/api/v1/admin/attendance/leave` | `POST` | `ADMIN` | `{ staffId, leaveType, startDate, endDate, reason }` | Catat izin/sakit/cuti, balasan `{ success, message }` |
| `/api/v1/admin/attendance/:id/overtime` | `PATCH` | `ADMIN` | `{ status: APPROVED \| REJECTED \| OVERRIDDEN, approvedMinutes?, notes? }` | Review lembur; boleh diulang |
| `/api/v1/admin/attendance/:id/correction` | `PATCH` | `ADMIN` | `{ clockOutTime: "HH:mm" \| ISO, notes }` | Koreksi jam pulang (termasuk staf yang lupa clock-out) |
| `/api/v1/admin/staff` | `GET` | `ADMIN` | Query: `role`, `search`, `page`, `limit` | Daftar akun staf |
| `/api/v1/admin/staff` | `POST` | `ADMIN` | `{ name, email, role, password, pinCode?, phone?, dailyShiftHours? }` | Buat akun staf |
| `/api/v1/admin/staff/:id` | `PUT` | `ADMIN` | `{ name, email, role, phone, isActive, dailyShiftHours? }` | Edit profil staf |
| `/api/v1/admin/staff/:id/pin` | `PUT` | `ADMIN` | `{ pinCode }` | Set/reset PIN; sekaligus membuka lockout PIN |
| `/api/v1/admin/staff/:id` | `DELETE` | `ADMIN` | - | Nonaktifkan akun staf (soft delete) |

---

## 🧮 4. Business Logic & Rumus Kalkulasi Backend

1. **Haversine Distance Check (Geofence Validation)** (`src/modules/attendance/utils/geofence.util.ts`):
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
   - Jika `distance > branchSetting.geofenceRadius` (default 100 m) $\rightarrow$ `400 Bad Request` ("Lokasi berada di luar radius cabang kafe").

2. **Tanggal & Status Terlambat (WIB)**:
   - `date` presensi adalah tanggal WIB, bukan UTC, jadi presensi pukul 00:00–07:00 WIB masuk ke hari yang benar.
   - Clock-in setelah `openTime` (jam dinding WIB) + `lateGracePeriod` menit $\rightarrow$ `LATE`, selain itu `ON_TIME`.
   - Saat clock-out: `ON_TIME` menjadi `COMPLETED`; `LATE` tetap `LATE`.

3. **Lembur**:
   - `overtimeMinutes = max(0, workDurationMinutes − dailyShiftHours × 60)`, dihitung saat clock-out dan dihitung ulang saat koreksi.
   - Status awal menunggu review (`overtimeReviewStatus = null`). `APPROVED` menyetujui menit hasil hitung, `REJECTED` memberi 0 menit, `OVERRIDDEN` memakai `approvedMinutes` (0–1440). `APPROVED`/`REJECTED` tanpa lembur hasil hitung dibalas `400`; review sebelum clock-out dibalas `409`.
   - Di respons, `overtimeMinutes` berisi menit override jika `OVERRIDDEN`, selain itu menit hasil hitung. `isOvertimeApproved` = `null` (menunggu), `false` (REJECTED), atau `true`.

4. **Koreksi Jam Pulang**:
   - `clockOutTime` `HH:mm` dibaca sebagai jam WIB pada tanggal presensi; jika tidak setelah jam masuk, dianggap hari berikutnya (shift lewat tengah malam). ISO datetime juga diterima.
   - Ditolak (`400`) jika tidak setelah jam masuk, di masa depan, durasi lebih dari 24 jam, atau presensi tidak punya jam masuk.
   - Durasi dan lembur dihitung ulang; review lembur di-reset jika menit lemburnya berubah. Pengoreksi, waktu, alasan, dan jam pulang sebelum koreksi pertama disimpan untuk audit.

5. **Lockout PIN Bersama**:
   - Verifikasi PIN di `POST /auth/verify-pin`, clock-in, dan clock-out memakai satu counter (`PinVerificationService`).
   - 5 PIN salah berturut-turut $\rightarrow$ terkunci 5 menit (`429`), dan selama terkunci PIN tidak dicek sama sekali. PIN benar me-reset counter; reset PIN oleh admin juga membuka kunci.
