# Handoff dari Frontend: Hasil Audit FE & Kebutuhan Backend

> **Tanggal**: 2026-11-20  
> **Dari**: sesi audit & perbaikan di repo frontend `fe-menu-scan-latihan` (branch `feat/admin-cms`, belum di-commit)  
> **Untuk**: siapa pun (manusia atau Claude) yang mengerjakan repo backend ini  
> **Status**: sebagian selesai. Modul shift dan konsolidasi pembayaran sudah ada di branch lokal `feat/cashier-shift-payment` (belum di-push); lihat bagian 6  

Dokumen ini berdiri sendiri: tidak perlu membaca percakapan apa pun untuk memahaminya. Semua path `fe/...` merujuk ke `d:\code\fe-menu-scan-latihan`.

---

## Ringkasan

Frontend baru saja diaudit dan diperbaiki. Dua perubahan di FE langsung berdampak ke backend:

1. **Fallback data mock di FE sekarang mati secara default.** Sebelumnya API staf dan shift di FE diam-diam memakai data palsu di `localStorage` kalau request gagal (termasuk 401/403/409), sehingga UI menampilkan "berhasil" padahal data tidak tersimpan. Sekarang error backend tampil apa adanya. Endpoint yang **belum ada di backend akan langsung terlihat error di UI**.
2. **Exit guard mode kiosk sekarang memverifikasi PIN ke backend** lewat endpoint baru `POST /auth/verify-pin`, yang belum ada.

Daftar endpoint yang dipanggil FE (sumber kebenaran: kode FE): `fe/docs/fe/integration/api-endpoints.md`.

---

## 1. Yang belum ada di backend (dicek terhadap `src/modules/**/*.controller.ts` pada 2026-11-20)

| Prioritas | Endpoint yang dipanggil FE | Dipakai di FE | Dampak kalau tidak ada |
| :---: | :--- | :--- | :--- |
| 🔴 P0 | `GET /admin/shifts/current`<br>`POST /admin/shifts/open`<br>`POST /admin/shifts/:id/close`<br>`GET /admin/shifts?page&limit&startDate&endDate&status` | `fe/src/lib/api/admin-shifts-api.ts`, halaman `/admin/shifts` | **Seluruh modul shift kasir & Z-Report error.** Tidak ada `ShiftsController` sama sekali. Sebelumnya tertutup oleh data mock FE. |
| 🔴 P0 | `POST /auth/verify-pin` | `fe/src/lib/api/auth-api.ts` → `verifyStaffPin`, `fe/src/components/kiosk/kiosk-exit-dialog.tsx` | Kasir **tidak bisa keluar dari mode kiosk** (`/cashier/kiosk`). FE menampilkan "Verifikasi PIN belum tersedia di server." |
| 🟠 P1 | `PATCH /admin/attendance/:id/overtime` | `reviewOvertime` di `fe/src/lib/api/admin-attendance-api.ts`, `OvertimeReviewModal` | Admin tidak bisa menyetujui/menolak lembur. |
| 🟠 P1 | `PATCH /admin/attendance/:id/correction` | `correctAttendanceTime`, `AttendanceCorrectionModal` | Admin tidak bisa mengoreksi jam presensi. |

### Schema respons yang diharapkan FE

Schema Zod di FE memvalidasi setiap respons. Respons yang tidak cocok ditolak sebagai `CONTRACT_VIOLATION`. Sebelum mengimplementasikan, cocokkan bentuk respons dengan:

- Shift: `ShiftItemSchema`, `ShiftHistoryResponseSchema` di `fe/src/lib/validations/shift.schema.ts`. Payload request: `OpenShiftInput` (`openingCash`, `notes?`) dan `CloseShiftInput` (`actualCash`, `notes?`). `GET /admin/shifts/current` boleh mengembalikan `null` jika tidak ada shift aktif.
- Presensi: `AttendanceItemSchema` dan input lembur/koreksi di `fe/src/lib/validations/attendance.schema.ts`.
- Semua respons sukses boleh dibungkus `{ data: ... }`; FE membuka `json.data` jika ada.

---

## 2. Kontrak baru: `POST /auth/verify-pin`

Dipakai saat kasir menekan tombol keluar dari mode kiosk. Tujuannya memastikan hanya kasir yang sedang login (pemilik sesi tablet) yang bisa kembali ke POS.

- **Auth**: `JwtAuthGuard`. PIN yang diverifikasi adalah PIN **milik user dari JWT**, bukan dari body.
- **Transport**: lewat handshake + enkripsi payload seperti endpoint admin lain (FE mengirim header `x-handshake-token` dan body terenkripsi), karena PIN adalah kredensial.
- **Request body** (setelah didekripsi): `{ "pinCode": "1234" }`. Validasi: tepat 4 digit.
- **Response 200**: `{ "valid": true }` atau `{ "valid": false }`.
- **PIN salah → `200 { valid: false }` atau `400`. JANGAN `401`.** Di FE, `401` berarti sesi kedaluwarsa dan memicu alur refresh token / modal login ulang.
- **Rate limit (disarankan)**: kunci sementara setelah beberapa kali gagal, balas `429`. FE sudah menampilkan pesan "Terlalu banyak percobaan".
- **Implementasi**: PIN sudah disimpan sebagai hash bcrypt (lihat `auth.service.ts`, alur onboarding), jadi cukup `bcrypt.compare(dto.pinCode, user.pinCode)`. Jika user belum punya PIN, balas `{ valid: false }`.

Cara FE menafsirkan respons (`fe/src/components/kiosk/kiosk-exit-dialog.tsx`):

| Respons backend | Yang terjadi di FE |
| :--- | :--- |
| `200 { valid: true }` | Keluar dari kiosk |
| `200 { valid: false }`, atau 4xx lain | "PIN kasir salah" |
| `404` / `501` | "Verifikasi PIN belum tersedia di server" |
| `429` | "Terlalu banyak percobaan" |
| `0` (jaringan) / 5xx | Pesan koneksi / gagal verifikasi |

---

## 3. Hal yang perlu dicek / diputuskan

1. **Validasi role wajib di backend.** Proteksi halaman di FE hanya di sisi client (`AuthGuard`/`RoleGuard`, belum ada middleware server). Siapa pun yang punya token valid bisa memanggil API langsung. Pastikan setiap controller `admin/*` memakai `RolesGuard` dengan role yang tepat. Catatan dari FE: kasir bisa membuka KDS (`/kitchen/orders`) dan halaman meja kasir mengizinkan CRUD meja & zona. Konfirmasi apakah role kasir memang boleh melakukan itu di API.
2. **Penyimpanan token.** FE saat ini menyimpan access & refresh token di `localStorage` (rawan XSS). Rencana jangka menengah: refresh token dipindah ke cookie `HttpOnly; Secure; SameSite`. Butuh dukungan backend (set-cookie di login/refresh, CORS `credentials: true`). Belum dikerjakan; dicatat sebagai roadmap FE 4C.15.
3. **`NEXT_PUBLIC_APP_SECRET`** (salt HKDF untuk enkripsi payload) terkirim ke browser karena berprefiks `NEXT_PUBLIC_`. Artinya enkripsi payload bukan pengganti TLS. Tidak perlu diubah sekarang, tapi jangan perlakukan nilai ini sebagai rahasia server.

---

## 4. Dokumentasi backend yang perlu disinkronkan

Folder `docs/` di repo ini disalin ke `fe/docs/be/` sebagai referensi. Beberapa isinya tidak lagi cocok dengan kode backend:

- `docs/integration/frontend-integration-guide.md` menulis `PATCH` untuk update status pesanan & menu; controller menerima `PUT` dan `PATCH` (FE memakai `PUT`).
- Blueprint presensi menulis `/staff/attendance/*` dan field `userId`/`clockInLatitude`/`isWithinRadius`; controller memakai `/admin/attendance/*` dengan `staffId`/`latitude`/`longitude`.
- Endpoint yang ada di kode tapi belum ada di integration guide: `/auth/onboard`, `/admin/settings/shift-templates[/seed-defaults]`, `/admin/uploads/image`, dan nanti `/auth/verify-pin` & `/admin/shifts/*`.

Setelah diperbarui, salin ulang ke `fe/docs/be/`.

---

## 5. Checklist

- [x] Modul shift kasir: `GET current`, `POST open`, `POST :id/close`, `GET` riwayat berpaginasi (`src/modules/shifts/`, 2026-11-20)
- [x] `POST /auth/verify-pin` + rate limit (2026-11-21: kunci 5 menit setelah 5x salah berturut-turut → `429`; throttle 10 request/menit per IP; reset PIN oleh admin membuka kunci)
- [ ] `PATCH /admin/attendance/:id/overtime`
- [ ] `PATCH /admin/attendance/:id/correction`
- [ ] Audit `RolesGuard` di semua controller `admin/*`
- [ ] Sinkronkan `docs/integration/frontend-integration-guide.md`
- [ ] Beri kabar ke FE setelah selesai (update shift & pembayaran sudah dikirim 2026-11-21; sisanya menyusul), supaya `fe/docs/fe/integration/api-endpoints.md` diperbarui

---

## 6. Update backend 2026-11-21: shift kasir & pembayaran

Sudah ada di branch lokal `feat/cashier-shift-payment` (commit `6a13442`, `b84dc4f`), belum di-push. Jalankan backend dari branch ini untuk integrasi.

### Endpoint shift (`@Roles(ADMIN, CASHIER)`)

| Method | Path | Catatan |
| :--- | :--- | :--- |
| `GET` | `/admin/shifts/current` | `null` jika tidak ada shift terbuka. Total dihitung live. |
| `POST` | `/admin/shifts/open` | Body `{ openingCash, notes? }` → `201`. `409` jika sudah ada shift terbuka (satu per cabang). |
| `POST` | `/admin/shifts/:id/close` | Body `{ actualCash, notes? }` → `200` + snapshot Z-Report. `403` jika bukan pembuka shift atau ADMIN, `409` jika sudah ditutup. |
| `GET` | `/admin/shifts?page&limit&startDate&endDate&status` | `limit` 1–100. Tanggal `YYYY-MM-DD` (hari WIB) atau ISO datetime. |

Respons mengikuti `ShiftItemSchema` FE, ditambah `closedById`, `closedByName`, `openingNotes`, `closingNotes`. `notes` = `closingNotes ?? openingNotes`. `expectedCash = openingCash + totalCashRevenue`, `cashVariance = actualCash - expectedCash`.

### Perubahan perilaku yang perlu ditangani FE

1. **Bayar tunai wajib ada shift terbuka.** `PUT /admin/orders/:id/status` dengan `status: PAID` (metode `CASH`) membalas `409` "Belum ada shift kasir yang dibuka..." jika laci belum dibuka. Tampilkan pesannya dan arahkan kasir ke buka shift.
2. **Field opsional `paymentMethod: 'CASH' | 'QRIS'`** di body update status. Default `CASH`. Menandai PAID ulang dengan metode yang sama aman (respons `200`, tidak ada perubahan); dengan metode berbeda membalas `409`.
3. **Definisi "sudah dibayar" = `paidAt` terisi dan status bukan `CANCELLED`.** Order PREPARING/SERVED yang sudah dibayar ikut dihitung di dashboard, laporan omzet, dan menu terlaris, jadi angkanya akan naik dibanding sebelumnya. Omzet dihitung per `paidAt` dengan batas hari WIB.
4. **Parameter `startDate`/`endDate` laporan** harus tanggal `YYYY-MM-DD` atau ISO datetime; nilai lain dibalas `400`.
5. **`create-qris`** menolak (`409`) order yang sudah dibayar (walaupun statusnya sudah PREPARING/SERVED) atau dibatalkan.
6. Bentuk respons endpoint order, pembayaran, dan laporan tidak berubah.
