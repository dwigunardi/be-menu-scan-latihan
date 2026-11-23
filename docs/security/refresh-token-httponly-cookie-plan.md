# 🍪 Rencana: Refresh Token di Cookie `HttpOnly`

> **Status**: Rencana, belum dikerjakan (disusun 2026-11-23, bagian FE sudah direview sesi FE)
> **Lingkup**: Backend (`src/modules/auth`, `src/main.ts`) dan Frontend (`fe/src/lib/api`, `fe/src/store/use-auth-store.ts`)
> **Asal**: Roadmap FE 4C.15 dan handoff `docs/handoff/2026-11-20-fe-audit-handoff.md` bagian 3 nomor 2
> **Terkait**: [staff-login-and-token-lifecycle.md](./staff-login-and-token-lifecycle.md), [auth-ecdh-dual-token-flow.md](../architecture/auth-ecdh-dual-token-flow.md)

---

## 1. Masalah

Refresh token berumur 7 hari dan disimpan FE di `localStorage` (zustand persist `kumpul_cafe_auth`). Script apa pun yang berjalan di halaman FE (misalnya lewat XSS atau dependency yang disusupi) bisa membacanya dan mengambil alih sesi staf selama 7 hari, termasuk sesi kasir yang bisa menandai order lunas.

Cookie `HttpOnly` tidak bisa dibaca JavaScript, sehingga refresh token tidak bisa dicuri lewat XSS. Access token (15 menit) tetap dikirim lewat header `Authorization`; memindahkannya ke memori saja dibahas di bagian 9.

## 2. Kondisi Saat Ini

**Backend**
- `POST /auth/login` dan `POST /auth/onboard` mengembalikan `{ accessToken, refreshToken, user }` di body.
- `POST /auth/refresh` (`JwtRefreshStrategy`) membaca refresh token dari `body.refreshToken` atau header `Authorization`, memverifikasi JWT, lalu mencocokkan hash bcrypt di `User.refreshToken`. Setiap refresh me-rotate token (hash lama diganti).
- Hanya ada **satu** hash refresh token per user. Login di perangkat lain mencabut sesi perangkat sebelumnya.
- `POST /auth/logout` butuh access token yang masih valid, lalu mengosongkan `User.refreshToken`.
- CORS sudah `credentials: true` dengan origin eksplisit (`FRONTEND_URL`, `localhost:3000`, `localhost:3001`).
- `cookie-parser` belum terpasang.

**Frontend**
- Store menyimpan `user`, `accessToken`, `refreshToken` di `localStorage`.
- `refreshTokenApi` mengirim refresh token di body dan header `Authorization`.
- Silent refresh memakai single-flight per tab (`pipeline-runner.ts`). Tidak ada koordinasi antar tab.
- `fetch` belum memakai `credentials: 'include'`. Semua request (termasuk login, onboard, refresh) lewat satu `fetch` di `src/lib/api/pipeline/pipeline-runner.ts` melalui `apiTransport`.
- **FE tidak pernah memanggil `POST /auth/logout`.** Semua titik logout (header, dialog keluar kiosk, refresh gagal di `pipeline-runner.ts`, modal sesi habis) hanya menghapus store lokal; refresh token di BE tetap valid sampai kedaluwarsa.
- Schema `LoginResponseSchema` dan `RefreshTokenResponseSchema` sudah menganggap `refreshToken` opsional, sehingga BE bisa berhenti mengirimnya tanpa memecah FE.

## 3. Desain Target

### Cookie

| Atribut | Nilai | Alasan |
| :--- | :--- | :--- |
| Nama | `menuscan_rt` | |
| `HttpOnly` | ya | Tidak bisa dibaca JavaScript |
| `Secure` | ya di production; tidak di development (`http://localhost`) | Hanya lewat HTTPS |
| `SameSite` | `Strict` (default, bisa diatur lewat env) | Tidak terkirim dari situs lain, mencegah CSRF |
| `Path` | `/api/v1/auth` | Hanya terkirim ke endpoint auth, bukan ke setiap request API |
| `Max-Age` | sama dengan `JWT_REFRESH_EXPIRES_IN` (7 hari) | |
| `Domain` | tidak diisi (host-only) | Cookie hanya untuk host API |

### Perilaku endpoint

| Endpoint | Perubahan |
| :--- | :--- |
| `POST /auth/login`, `POST /auth/onboard` | Mengirim `Set-Cookie: menuscan_rt=...`. Selama masa transisi `refreshToken` tetap ada di body; setelahnya dihapus dari body. |
| `POST /auth/refresh` | Membaca refresh token dari **cookie lebih dulu**, lalu body/header hanya selama masa transisi. Body request tidak wajib lagi. Merespons `{ accessToken }` + `Set-Cookie` token baru (rotasi tetap). Gagal (`401`) → cookie dihapus. |
| `POST /auth/logout` | Selalu menghapus cookie (`Max-Age=0`). Mencabut sesi dengan access token jika masih valid, **atau** dengan refresh cookie jika access token sudah kedaluwarsa, supaya logout tetap berhasil setelah tab lama ditinggal. |

### Perlindungan CSRF

Karena browser mengirim cookie otomatis, endpoint yang membaca cookie (`/auth/refresh`, `/auth/logout`) diberi tiga lapis:
1. `SameSite=Strict`: cookie tidak ikut request yang dipicu situs lain.
2. **Cek header `Origin`**: request yang membawa cookie wajib berasal dari origin di allowlist CORS; selain itu `403`.
3. **Wajib `Content-Type: application/json`**: memaksa preflight CORS sehingga form HTML dari situs lain tidak bisa memanggilnya.

Serangan CSRF ke `/auth/refresh` tidak membocorkan token (respons diblokir CORS), tetapi tanpa perlindungan di atas bisa memaksa rotasi dan membuat sesi korban kedaluwarsa.

### Konfigurasi baru (env)

| Variabel | Nilai | Default |
| :--- | :--- | :--- |
| `REFRESH_TOKEN_TRANSPORT` | `body` \| `both` \| `cookie` | `both` selama transisi, `cookie` setelah FE selesai migrasi |
| `REFRESH_COOKIE_SAMESITE` | `strict` \| `lax` \| `none` | `strict` |

`none` hanya dipakai jika FE dan API berbeda *site* (lihat bagian 4) dan otomatis memaksa `Secure`.

## 4. Keputusan yang Dibutuhkan: Topologi Domain Production

Cookie `SameSite=Strict`/`Lax` hanya terkirim jika FE dan API berada di **site yang sama** (domain terdaftar yang sama). Port tidak dihitung, jadi `localhost:3000` → `localhost:5000` aman di development.

| Opsi | Contoh | `SameSite` | Catatan |
| :--- | :--- | :--- | :--- |
| **A. Subdomain satu domain (disarankan)** | `app.kumpulcafe.id` → `api.kumpulcafe.id` | `Strict` | Paling sederhana dan paling aman. |
| B. Proxy lewat Next.js | FE `/api/*` di-rewrite ke API | `Strict` | Same-origin; cookie `Path` menjadi path proxy. Menambah hop dan perlu penyesuaian WebSocket. |
| C. Domain berbeda | `kumpulcafe.vercel.app` → `api.kumpulcafe.id` | `None; Secure` | Dianggap *third-party cookie*: diblokir Safari (ITP) dan makin dibatasi Chrome. **Hindari.** |

Domain production perlu dipastikan sebelum Tahap 1 di-deploy ke production.

## 5. Rencana Bertahap

Setiap tahap bisa di-deploy sendiri tanpa memutus sesi yang sedang berjalan.

| Tahap | Repo | Isi | Kondisi selesai |
| :--- | :--- | :--- | :--- |
| **0. Prasyarat** | — | Tetapkan topologi domain (bagian 4). | Domain production disepakati. |
| **1. BE dual-mode** | BE | Pasang `cookie-parser`; login/onboard/refresh mengirim cookie **dan** tetap mengembalikan `refreshToken` di body (`REFRESH_TOKEN_TRANSPORT=both`); refresh membaca cookie dulu lalu body/header; logout menghapus cookie dan bisa memakai refresh cookie; cek `Origin` & `Content-Type`. | FE lama tetap berjalan tanpa perubahan; FE baru bisa memakai cookie. |
| **2. FE migrasi** | FE | `credentials: 'include'` untuk `/auth/login`, `/auth/onboard`, `/auth/refresh`, `/auth/logout`; **panggil `POST /auth/logout` di semua titik logout**; berhenti mengirim refresh token; hapus `refreshToken` dari store & `partialize`; bersihkan nilai lama di `localStorage` saat rehydrate; koordinasi refresh antar tab (bagian 7). | Tidak ada refresh token di `localStorage` maupun di request body, dan setiap logout menghapus cookie di BE. |
| **3. BE cookie-only** | BE | `REFRESH_TOKEN_TRANSPORT=cookie`: `refreshToken` tidak lagi dikirim di body; refresh menolak token dari body/header. | Token hanya ada di cookie. |
| **4. Bersih-bersih** | BE + FE | Hapus kode mode `body`/`both`, `RefreshTokenDto`, dan cabang fallback di FE; perbarui dokumen lifecycle token. | Satu jalur saja. |

Tahap 3 baru boleh dijalankan setelah FE Tahap 2 ter-deploy di semua perangkat (termasuk tablet kiosk yang jarang di-reload), **dan** semua titik logout FE sudah memanggil `POST /auth/logout`. Sesi FE lama yang masih memegang refresh token di `localStorage` akan gagal refresh dan diarahkan ke modal login ulang (`SessionExpiredModal`), tanpa kehilangan pekerjaan di halaman.

## 6. Detail Perubahan

### Backend
- `package.json`: `cookie-parser`, `@types/cookie-parser`; `src/main.ts`: `app.use(cookieParser())`.
- `src/config/env.config.ts`: `REFRESH_TOKEN_TRANSPORT`, `REFRESH_COOKIE_SAMESITE` (validasi Zod; `none` memaksa `Secure`).
- Helper baru (mis. `src/modules/auth/refresh-cookie.ts`): `setRefreshCookie(res, token)`, `clearRefreshCookie(res)`, opsi cookie dari env.
- `auth.controller.ts`: login, onboard, refresh, logout memakai `@Res({ passthrough: true })` untuk menulis cookie; respons body tetap lewat `TransformInterceptor` dan enkripsi payload seperti sekarang (header `Set-Cookie` tidak terpengaruh enkripsi).
- `jwt-refresh.strategy.ts`: extractor membaca `req.cookies.menuscan_rt` lebih dulu; body/header hanya jika transport bukan `cookie`.
- `refresh-token.dto.ts`: `refreshToken` menjadi opsional (Tahap 1), dihapus di Tahap 4.
- Guard/cek kecil untuk `Origin` + `Content-Type` pada refresh & logout.
- `logout`: endpoint dibuat bisa diakses tanpa access token valid (`@Public()`), mencabut sesi berdasarkan access token **atau** refresh cookie, lalu selalu menghapus cookie.
- Test: unit test helper & strategy; e2e/smoke untuk login → cookie terset, refresh tanpa body, rotasi, logout dengan access token kedaluwarsa, request lintas origin ditolak, mode `both` vs `cookie`.

### Frontend
- `pipeline-runner.ts` + `ApiTransportOptions`: tambah opsi (mis. `withCredentials`) yang diteruskan ke `fetch` sebagai `credentials: 'include'`. Mengubah `auth-api.ts` saja tidak cukup karena `fetch`-nya ada di pipeline.
- `auth-api.ts`: `refreshTokenApi()` tanpa argumen dan tanpa body/header token; login, onboard, refresh, dan `logoutApi()` baru memakai `withCredentials`.
- **`logoutApi()` dipanggil di semua titik logout** (header, dialog keluar kiosk, refresh gagal di `pipeline-runner.ts`, modal sesi habis), lalu store lokal dihapus. Tanpa ini, cookie kasir sebelumnya tetap tersimpan di perangkat bersama (lihat bagian 7).
- `use-auth-store.ts`: hapus `refreshToken` dari state, `setAuth`, `updateTokens`, dan `partialize`; saat rehydrate hapus field `refreshToken` lama dari `localStorage`.
- `src/app/(auth)/login/page.tsx` dan `src/app/onboarding/page.tsx`: berhenti meneruskan `refreshToken` ke `setAuth` / `updateTokens`. Redaksi field `refreshToken` di `logger-middleware.ts` boleh tetap ada.
- `pipeline-runner.ts` (`attemptSilentTokenRefresh`): tidak lagi mengecek `refreshToken` di store (cookie tidak terlihat JS), tetapi **tetap mensyaratkan `user` ada di store** sebagai tanda sesi FE aktif. Tanpa `user`, jangan refresh; langsung ke `/login`. Refresh `401` → modal login ulang.
- `shift-handover-modal.tsx`: lihat temuan di bawah. Setelah migrasi, serah terima memanggil `logoutApi()` untuk kasir lama (mencabut hash refresh token-nya di BE) lalu login sebagai kasir pengganti, sehingga cookie berisi sesi kasir baru.
- Koordinasi antar tab (bagian 7).

> [!WARNING]
> **Temuan saat menyusun rencana (berlaku sekarang, terlepas dari cookie; dikonfirmasi sesi FE):** `onSubmit` di `shift-handover-modal.tsx` **tidak memanggil API apa pun**. PIN kasir pengganti tidak pernah diverifikasi (PIN berapa pun diterima); yang diganti hanya profil `user` di store lokal, sementara `accessToken`/`refreshToken` tetap milik kasir lama. Akibatnya:
> - siapa pun bisa "menjadi" staf lain di UI tanpa PIN;
> - backend membaca identitas dari JWT, jadi semua aksi setelah serah terima tetap tercatat atas nama kasir lama: `receivedById` pembayaran, pembuka/penutup shift, dan pemeriksaan role;
> - tab "Magic Link" mengarah ke `/handover`, route yang tidak ada di FE.
>
> Serah terima perlu benar-benar mengautentikasi kasir pengganti (`POST /auth/login`, atau endpoint serah terima khusus berbasis PIN) dan memakai token hasilnya. Ini harus diperbaiki lebih dulu, tidak menunggu migrasi cookie. Pendekatannya menunggu keputusan user.

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| **Refresh bersamaan dari beberapa tab** | Semua tab mengirim cookie yang sama; tab pertama me-rotate token, tab kedua membawa token lama → `401` → modal login ulang. | FE: kunci antar tab dengan `navigator.locks.request('menuscan-refresh', ...)` (atau `BroadcastChannel`) sehingga hanya satu tab yang refresh dan tab lain memakai hasilnya. Opsional BE: terima token sebelumnya selama ±30 detik setelah rotasi. |
| **Satu sesi per user** | Kasir yang login di POS dan tablet kiosk dengan akun yang sama saling mencabut. Sudah terjadi hari ini, cookie tidak mengubahnya. | Di luar cakupan rencana ini; lihat bagian 9. |
| **Tablet kiosk jarang reload** | Bundle FE lama tetap memakai refresh token di body setelah Tahap 3. | Tahap 3 menunggu semua perangkat memuat FE baru; sesi lama jatuh ke modal login ulang, bukan error. |
| **Cookie tidak terkirim di production** | Silent refresh selalu gagal. | Pastikan topologi domain (bagian 4) dan uji di staging dengan domain sebenarnya sebelum Tahap 3. |
| **`Secure` di development** | Cookie `Secure` tidak tersimpan di `http://localhost`. | `Secure` hanya aktif di production (atau saat `SameSite=None`). |
| **Logout setelah access token kedaluwarsa** | Cookie tertinggal di browser. | Logout bisa memakai refresh cookie dan selalu menghapus cookie. |
| **Perangkat bersama (POS/kiosk) setelah logout lokal** | Jika FE hanya menghapus store, cookie kasir sebelumnya tetap valid 7 hari dan silent refresh bisa diam-diam memberi orang berikutnya sesi kasir tersebut. | FE memanggil `POST /auth/logout` di semua titik logout; silent refresh hanya berjalan jika `user` ada di store; Tahap 3 menunggu keduanya. |

## 8. Uji Penerimaan

1. Login → respons membawa `Set-Cookie: menuscan_rt=...; HttpOnly; SameSite=Strict; Path=/api/v1/auth`.
2. `document.cookie` di FE tidak menampilkan `menuscan_rt`, dan `localStorage` tidak berisi refresh token.
3. Access token kedaluwarsa → refresh tanpa body berhasil, cookie berganti (rotasi).
4. Refresh dengan cookie lama setelah rotasi → `401`, cookie dihapus.
5. Dua tab dibiarkan sampai access token kedaluwarsa lalu dipakai bersamaan → keduanya tetap login (kunci antar tab).
6. `POST /auth/refresh` dari origin lain → `403`.
7. Logout dengan access token kedaluwarsa → sesi dicabut dan cookie dihapus.
8. Logout dari setiap titik FE (header, keluar kiosk, refresh gagal, modal sesi habis) → `POST /auth/logout` terkirim dan cookie hilang. Setelah itu, membuka FE di perangkat yang sama tidak mendapatkan sesi apa pun.
9. Mode `both`: FE lama (body) dan FE baru (cookie) sama-sama berjalan. Mode `cookie`: refresh lewat body ditolak.

## 9. Di Luar Cakupan

- **Access token hanya di memori**: saat ini access token juga dipersist ke `localStorage`. Setelah refresh token di cookie, access token bisa disimpan di memori saja dan diambil ulang lewat refresh saat halaman dimuat. Disarankan sebagai langkah lanjutan setelah Tahap 4.
- **Multi-sesi per user**: tabel `RefreshSession` (satu baris per perangkat) supaya POS dan kiosk tidak saling mencabut, sekaligus fitur "keluar dari semua perangkat".
- **Deteksi pemakaian ulang token** (*reuse detection*): jika token yang sudah di-rotate dipakai lagi, cabut seluruh sesi user.
