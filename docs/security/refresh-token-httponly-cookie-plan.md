# 🍪 Refresh Token di Cookie `HttpOnly`

> **Status**: Backend selesai (2026-11-23, branch `feat/refresh-token-cookie`); Frontend menyusul. Jalur pra-production: BE dan FE diubah sekaligus, tanpa masa transisi.
> **Lingkup**: Backend (`src/modules/auth`, `src/common/guards`, `src/main.ts`) dan Frontend (`fe/src/lib/api`, `fe/src/store/use-auth-store.ts`)
> **Asal**: Roadmap FE 4C.15 dan handoff `docs/handoff/2026-11-20-fe-audit-handoff.md` bagian 3 nomor 2
> **Terkait**: [staff-login-and-token-lifecycle.md](./staff-login-and-token-lifecycle.md), [auth-ecdh-dual-token-flow.md](../architecture/auth-ecdh-dual-token-flow.md)

---

## 1. Masalah

Refresh token berumur 7 hari dan disimpan FE di `localStorage` (zustand persist `kumpul_cafe_auth`). Script apa pun yang berjalan di halaman FE (misalnya lewat XSS atau dependency yang disusupi) bisa membacanya dan mengambil alih sesi staf selama 7 hari, termasuk sesi kasir yang bisa menandai order lunas.

Cookie `HttpOnly` tidak bisa dibaca JavaScript, sehingga refresh token tidak bisa dicuri lewat XSS. Access token (15 menit) tetap dikirim lewat header `Authorization`; memindahkannya ke memori saja dibahas di bagian 9.

## 2. Kontrak Backend (sudah diimplementasikan)

### Cookie `menuscan_rt`

| Atribut | Nilai | Alasan |
| :--- | :--- | :--- |
| `HttpOnly` | ya | Tidak bisa dibaca JavaScript |
| `Secure` | ya di production, atau jika `SameSite=None`; tidak di development (`http://localhost`) | Hanya lewat HTTPS |
| `SameSite` | `Strict` (env `REFRESH_COOKIE_SAMESITE`: `strict` \| `lax` \| `none`) | Tidak terkirim dari situs lain |
| `Path` | `/api/v1/auth` | Hanya terkirim ke endpoint auth, bukan ke setiap request API |
| `Max-Age` | sisa umur token (dari klaim `exp`, default 7 hari) | Cookie dan token kedaluwarsa bersamaan |
| `Domain` | tidak diisi (host-only) | Cookie hanya untuk host API |

### Perilaku endpoint

| Endpoint | Request | Respons |
| :--- | :--- | :--- |
| `POST /auth/login` | JSON wajib (`Content-Type: application/json`, selain itu `415`) | `{ accessToken, user }` + `Set-Cookie`. **Tidak ada `refreshToken` di body.** |
| `POST /auth/onboard` | Bearer + JSON | `{ accessToken, user }` + `Set-Cookie` |
| `POST /auth/handover` | Bearer + JSON | `{ accessToken, user }` staf pengganti + `Set-Cookie` milik staf pengganti. Refresh token staf lama dicabut. |
| `POST /auth/refresh` | Tanpa body token: cookie saja. `Origin` di allowlist + `Content-Type: application/json` (kirim body `{}`) | `200 { accessToken }` + `Set-Cookie` token baru (rotasi). Lihat tabel `401` di bawah. |
| `POST /auth/logout` | Cookie saja (Bearer tidak dipakai). `Origin` di allowlist + JSON | Selalu `200` dan selalu menghapus cookie. Sesi dicabut **hanya jika** cookie yang dikirim adalah sesi yang sedang aktif. |

`401` dari refresh:

| Penyebab | Cookie |
| :--- | :--- |
| Tidak ada cookie, tanda tangan tidak valid, token kedaluwarsa, sesi sudah dicabut (logout/serah terima), staf nonaktif atau dihapus | **Dihapus** (sesi memang mati) |
| Token sudah di-rotate oleh refresh lain yang berjalan bersamaan, atau digantikan login yang lebih baru | **Tidak dihapus**: di browser, `Set-Cookie` dari refresh yang menang mungkin sudah menyimpan token baru |

### Perlindungan CSRF

- `SameSite=Strict`: cookie tidak ikut request yang dipicu situs lain.
- `CookieCsrfGuard` pada `/auth/refresh` dan `/auth/logout`: header `Origin` wajib ada di allowlist CORS (`FRONTEND_URL`, ditambah `localhost:3000/3001` **hanya di luar production**), dan `Content-Type` wajib `application/json` (memaksa preflight CORS). Selain itu `403`.
- `JsonBodyGuard` pada `/auth/login`: form HTML dari situs lain (urlencoded/multipart/text) ditolak `415`, sehingga situs lain tidak bisa menanamkan cookie sesi milik penyerang (*login CSRF*).

### Penyimpanan & rotasi

- Refresh token disimpan sebagai **SHA-256** (dibandingkan constant-time), bukan bcrypt. bcrypt hanya membaca 72 byte pertama, dan 72 byte pertama semua JWT milik satu user identik, sehingga dulu token lama/hasil rotasi tetap dianggap cocok. Hash bcrypt lama otomatis tidak cocok lagi (user login ulang sekali).
- Setiap refresh token membawa `jti` acak, jadi selalu unik.
- Rotasi bersyarat (`updateMany` pada hash yang diverifikasi): sesi yang dicabut di tengah refresh tidak pernah hidup kembali.
- Nonaktif/hapus staf (`PUT /admin/staff/:id` dengan `isActive: false`, `DELETE /admin/staff/:id`) langsung mencabut sesinya.
- Log server menyembunyikan header `cookie` dan `set-cookie`.

## 3. Keputusan Topologi Domain (sebelum production)

Cookie `SameSite=Strict`/`Lax` hanya terkirim jika FE dan API berada di **site yang sama** (domain terdaftar yang sama). Port tidak dihitung, jadi `localhost:3000` → `localhost:5000` sudah aman di development.

| Opsi | Contoh | `SameSite` | Catatan |
| :--- | :--- | :--- | :--- |
| **A. Subdomain satu domain (disarankan)** | `app.kumpulcafe.id` → `api.kumpulcafe.id` | `Strict` | Paling sederhana dan paling aman. |
| B. Proxy lewat Next.js | FE `/api/*` di-rewrite ke API | `Strict` | Same-origin; `Path` cookie mengikuti path proxy. Menambah hop dan perlu penyesuaian WebSocket. |
| C. Domain berbeda | `kumpulcafe.vercel.app` → `api.kumpulcafe.id` | `None; Secure` | Dianggap *third-party cookie*: diblokir Safari (ITP) dan makin dibatasi Chrome. **Hindari.** |

Proyek belum production, jadi cukup pegang satu syarat: **FE dan API kelak berada di satu domain** (opsi A). Tidak ada yang perlu diubah di kode; production cukup mengisi `FRONTEND_URL` dengan origin FE.

> [!IMPORTANT]
> **Development: buka FE lewat `http://localhost:3000`, bukan `http://127.0.0.1:3000`.** `127.0.0.1` dan `localhost` dihitung sebagai *site* berbeda, sehingga cookie `SameSite=Strict` dari API (`localhost:5000`) tidak terkirim, dan origin `127.0.0.1` juga tidak ada di allowlist (refresh/logout dibalas `403`). Menambahkan `127.0.0.1` ke allowlist tidak cukup karena cookie tetap tidak terkirim.

## 4. Jalur Pra-Production

Rencana awal memakai lima tahap dengan mode ganda (cookie + body) untuk melindungi sesi pengguna yang sedang berjalan. Karena belum ada pengguna sungguhan, jalur disederhanakan:

| Langkah | Repo | Status |
| :--- | :--- | :--- |
| 1. BE cookie-only: kontrak di bagian 2 | BE | ✅ Selesai (`feat/refresh-token-cookie`) |
| 2. FE pindah ke cookie (bagian 5) | FE | ⏳ Menyusul |
| 3. Merge BE dan FE berbarengan | BE + FE | ⏳ |

Sampai FE selesai, FE versi lama di lingkungan dev akan meminta login ulang setelah access token kedaluwarsa (refresh lewat body ditolak `401`). Login tetap berjalan karena schema FE sudah menganggap `refreshToken` opsional.

## 5. Yang Perlu Dikerjakan FE

- **`credentials: 'include'`** untuk `/auth/login`, `/auth/onboard`, `/auth/refresh`, `/auth/logout`, dan `/auth/handover`. `fetch` ada di `src/lib/api/pipeline/pipeline-runner.ts`, jadi perlu opsi di `ApiTransportOptions` (mis. `withCredentials`) yang diteruskan ke `fetch`; mengubah `auth-api.ts` saja tidak cukup.
- **Refresh & logout**: kirim `Content-Type: application/json` dengan body `{}` dan tanpa refresh token. Browser mengirim `Origin` otomatis.
- **`refreshTokenApi()`** tanpa argumen. Respons hanya `{ accessToken }`.
- **Hapus `refreshToken`** dari `use-auth-store.ts` (state, `setAuth`, `updateTokens`, `partialize`), dan hapus field lama dari `localStorage` saat rehydrate. `login/page.tsx` dan `onboarding/page.tsx` berhenti meneruskan `refreshToken`.
- **Silent refresh** (`attemptSilentTokenRefresh`) tidak lagi mengecek `refreshToken` di store (cookie tidak terlihat JS), tetapi tetap mensyaratkan `user` ada di store. Refresh `401` → modal login ulang.
- **Logout di semua titik** (sudah dikerjakan FE: `signOutStaff()`): cukup panggil `POST /auth/logout` dengan cookie; Bearer tidak diperlukan lagi, dan logout tidak pernah `401`. Alur "logout → 401 → refresh → logout ulang" tidak diperlukan.
- **Serah terima**: `POST /auth/handover` dengan `withCredentials`; ganti `accessToken` dan `user` di store dengan hasilnya. Tidak perlu logout terpisah.
- **Kunci refresh antar tab** (`navigator.locks.request('menuscan-refresh', ...)`), karena semua tab berbagi satu cookie. Tanpa kunci, refresh yang kalah mendapat `401` (cookie tetap aman, tetapi tab itu perlu mengulang dengan cookie terbaru).

## 6. Riwayat: Temuan Serah Terima Shift

Saat menyusun rencana ditemukan bahwa modal serah terima FE tidak memanggil API apa pun: PIN kasir pengganti tidak diverifikasi dan token kasir lama tetap dipakai, sehingga aksi setelah serah terima tercatat atas nama kasir lama. Sudah diperbaiki lewat `GET /auth/handover/candidates` dan `POST /auth/handover` (PR BE #5, PR FE #4).

## 7. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| **Refresh bersamaan dari beberapa tab** | Refresh yang kalah mendapat `401`. | BE tidak menghapus cookie untuk kasus ini; FE memakai kunci antar tab. |
| **Satu sesi per user** | Login di perangkat lain menggantikan sesi sebelumnya (POS dan kiosk dengan akun sama saling menggantikan). | Logout dan refresh dari perangkat lama tidak lagi mematikan sesi perangkat baru. Multi-sesi penuh: bagian 9. |
| **Cookie tidak terkirim di production** | Silent refresh selalu gagal. | Pegang opsi A (bagian 3) dan uji di staging dengan domain sebenarnya. |
| **`Secure` di development** | Cookie `Secure` tidak tersimpan di `http://localhost`. | `Secure` hanya aktif di production (atau saat `SameSite=None`). |
| **Perangkat bersama (POS/kiosk)** | Cookie kasir sebelumnya tertinggal jika FE hanya menghapus store. | FE memanggil `POST /auth/logout` di semua titik logout; silent refresh hanya jika `user` ada di store. |
| **Logout terlambat / perangkat lama** | Dulu bisa mencabut sesi baru user yang sama. | Logout hanya mencabut sesi yang cookie-nya cocok persis. |

## 8. Uji Penerimaan

Sudah lolos di BE (smoke test ke server, 29 cek):

1. Login → `Set-Cookie: menuscan_rt=...; Max-Age=604799; Path=/api/v1/auth; HttpOnly; SameSite=Strict`, body tanpa `refreshToken`.
2. Refresh dengan cookie → `{ accessToken }` saja, cookie berganti; refresh berurutan selalu menghasilkan token berbeda.
3. Token hasil rotasi → `401` tanpa menghapus cookie; token dari sesi sebelumnya ditolak setelah login ulang.
4. Refresh tanpa `Origin`, dari origin lain, atau dengan `text/plain` → `403`; tanpa cookie → `401`; token di body → `401`.
5. Logout dengan cookie → sesi dicabut, cookie dihapus; logout dengan cookie lama tidak mematikan sesi baru; logout dengan access token saja tidak mencabut apa pun.
6. Dua refresh bersamaan → satu `200`, satu `401` tanpa menghapus cookie.
7. Login berbentuk form → `415` tanpa cookie.
8. Staf dinonaktifkan → refresh `401`, cookie dihapus.
9. Serah terima dan onboarding → `Set-Cookie` sesi yang benar, body tanpa `refreshToken`.
10. Refresh token tidak muncul di log server.

Perlu diuji setelah FE selesai:

11. `document.cookie` di FE tidak menampilkan `menuscan_rt`, dan `localStorage` tidak berisi refresh token.
12. Dua tab dibiarkan sampai access token kedaluwarsa lalu dipakai bersamaan → keduanya tetap login.
13. Logout dari setiap titik FE → cookie hilang; membuka FE lagi di perangkat yang sama tidak mendapatkan sesi.

## 9. Di Luar Cakupan

- **Access token hanya di memori**: setelah refresh token di cookie, access token bisa disimpan di memori saja dan diambil ulang lewat refresh saat halaman dimuat.
- **Multi-sesi per user**: tabel `RefreshSession` (satu baris per perangkat) supaya POS dan kiosk tidak saling menggantikan, sekaligus fitur "keluar dari semua perangkat".
- **Deteksi pemakaian ulang token** (*reuse detection*): jika token yang sudah di-rotate dipakai lagi, cabut seluruh sesi user.
