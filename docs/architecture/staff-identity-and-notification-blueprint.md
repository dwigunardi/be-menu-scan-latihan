# Blueprint Arsitektur Identitas Staf, Verifikasi Kontak (Email & WA), dan Notifikasi Siaran (Backend Perspective)

> **Project**: MenuScan – Digital QR Code Menu System & Multi-Branch FnB SaaS  
> **Backend Architecture**: NestJS 11 + TypeScript + PostgreSQL / Prisma ORM + Notification Adapters  
> **Document Location**: `docs/be/architecture/staff-identity-and-notification-blueprint.md`  
> **Status**: APPROVED ARCHITECTURE BLUEPRINT  

---

## 🎯 1. Overview Arsitektur Backend

Modul ini memperluas sistem otentikasi NestJS dari yang sebelumnya bersifat akun generik menjadi **Manajemen Identitas Karyawan Terpadu (*Enterprise Identity & Communications Hub*)**.

Fitur utama meliputi:
1. **Otentikasi & Profil Personal Lengkap**: Login via Email + Password atau PIN 4-digit.
2. **Dual-Channel Verification**: Token verifikasi Email (HMAC / SHA-256) & Kode OTP WhatsApp (6 digit).
3. **Multi-Channel Notification Gateway**: Adapter pengiriman Email (Resend/Nodemailer) dan WhatsApp (Fonnte/Wablas/WhatsApp Cloud API) untuk pengumuman darurat operasional cabang.

---

## 🗄️ 2. Skema Database Prisma (`schema.prisma`)

```prisma
model User {
  id                   String         @id @default(uuid())
  email                String         @unique
  password             String
  name                 String         // Contoh: "Ahmad Syahripudin"
  phone                String?        @unique // Format: "+6281234567890"
  role                 Role           @default(CASHIER) // ADMIN | CASHIER | KITCHEN | WAITER
  
  // Status & Token Verifikasi
  isEmailVerified      Boolean        @default(false)
  emailVerifyToken     String?
  emailVerifyExpiry    DateTime?
  
  isPhoneVerified      Boolean        @default(false)
  phoneOtp             String?
  phoneOtpExpiry       DateTime?
  
  // Keamanan Workstation
  pinCode              String?        // Hashed 4-digit PIN untuk quick clock-in
  dailyShiftHours      Int            @default(8)
  avatarUrl            String?
  isActive             Boolean        @default(true)
  
  // Relasi
  branchId             String         @default("default-branch")
  attendances          Attendance[]
  sentAnnouncements    Announcement[] @relation("SentAnnouncements")
  receivedAnnouncements AnnouncementRecipient[]
  
  joinedAt             DateTime       @default(now())
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  @@index([role, isActive])
  @@index([isEmailVerified, isPhoneVerified])
}

model Announcement {
  id              String                  @id @default(uuid())
  branchId        String                  @default("default-branch")
  title           String                  // Contoh: "Kafe Tutup Besok Mendadak"
  content         String                  @db.Text
  urgency         AnnouncementUrgency     @default(NORMAL) // NORMAL | URGENT | CRITICAL
  targetRoles     Role[]                  // Array role target (e.g. ['KITCHEN', 'CASHIER'])
  channels        NotificationChannel[]   // ['IN_APP', 'WHATSAPP', 'EMAIL']
  sentById        String
  sentBy          User                    @relation("SentAnnouncements", fields: [sentById], references: [id])
  recipients      AnnouncementRecipient[]
  sentAt          DateTime                @default(now())
  createdAt       DateTime                @default(now())

  @@index([branchId, sentAt])
}

model AnnouncementRecipient {
  id              String       @id @default(uuid())
  announcementId  String
  announcement    Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  userId          String
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  emailStatus     DeliveryStatus @default(PENDING) // PENDING | DELIVERED | FAILED | SKIPPED
  whatsappStatus  DeliveryStatus @default(PENDING)
  readAt          DateTime?    // Kapan staf membaca pengumuman di aplikasi
  createdAt       DateTime     @default(now())

  @@unique([announcementId, userId])
  @@index([userId, readAt])
}

enum AnnouncementUrgency {
  NORMAL
  URGENT
  CRITICAL
}

enum NotificationChannel {
  IN_APP
  WHATSAPP
  EMAIL
}

enum DeliveryStatus {
  PENDING
  DELIVERED
  FAILED
  SKIPPED
}
```

---

## 🔌 3. Spesifikasi Endpoint REST API

### A. Otentikasi & Verifikasi Kontak (`/api/v1/auth/*`)
| Endpoint | Method | Role | Payload Request | Deskripsi |
| :--- | :---: | :---: | :--- | :--- |
| **`/api/v1/auth/login`** | `POST` | `PUBLIC` | `{ email, password }` | Login staf (mengembalikan profil lengkap & token JWT) |
| **`/api/v1/auth/me`** | `GET` | `ALL_STAFF` | - | Ambil data profil staf saat ini & status verifikasi |
| **`/api/v1/auth/verify-email`** | `POST` | `PUBLIC` | `{ token }` | Verifikasi link email staf |
| **`/api/v1/auth/resend-email-verification`** | `POST` | `ALL_STAFF` | - | Kirim ulang email verifikasi |
| **`/api/v1/auth/verify-phone-otp`** | `POST` | `ALL_STAFF` | `{ otp }` | Verifikasi 6-digit kode OTP WhatsApp |
| **`/api/v1/auth/resend-phone-otp`** | `POST` | `ALL_STAFF` | - | Kirim ulang OTP ke nomor WhatsApp |
| **`/api/v1/auth/profile`** | `PUT` | `ALL_STAFF` | `{ name, phone, avatarUrl }` | Update data diri profil |
| **`/api/v1/auth/change-password`** | `PUT` | `ALL_STAFF` | `{ oldPassword, newPassword }` | Ganti password login |
| **`/api/v1/auth/pin`** | `PUT` | `ALL_STAFF` | `{ pinCode, password }` | Buat/Ubah PIN 4-digit untuk workstation clock-in |

---

### B. Siaran Darurat & Pengumuman (`/api/v1/admin/announcements/*`)
| Endpoint | Method | Role | Payload Request | Deskripsi |
| :--- | :---: | :---: | :--- | :--- |
| **`/api/v1/admin/announcements`** | `GET` | `ADMIN` | Query: `page`, `limit`, `urgency` | Riwayat log seluruh broadcast yang pernah dikirim |
| **`/api/v1/admin/announcements`** | `POST` | `ADMIN` | `{ title, content, urgency, targetRoles, channels }` | Kirim pengumuman darurat ke Email & WhatsApp staf |
| **`/api/v1/staff/announcements`** | `GET` | `ALL_STAFF` | - | Daftar pengumuman aktif untuk diri saya |
| **`/api/v1/staff/announcements/:id/read`**| `PUT` | `ALL_STAFF` | - | Tandai pengumuman sudah dibaca |

---

## 📡 4. Notification Provider Architecture (Adapters)

Sistem menggunakan **Provider Strategy Pattern** agar mudah berganti vendor pengiriman pesan:

```typescript
// Interface Universal WhatsApp Sender
export interface IWhatsAppProvider {
  sendTextMessage(to: string, message: string): Promise<{ success: boolean; messageId?: string }>;
  sendOtpMessage(to: string, otpCode: string): Promise<{ success: boolean }>;
}

// Interface Universal Email Sender
export interface IEmailProvider {
  sendEmail(to: string, subject: string, htmlContent: string): Promise<{ success: boolean; id?: string }>;
  sendVerificationEmail(to: string, name: string, token: string): Promise<{ success: boolean }>;
}
```
