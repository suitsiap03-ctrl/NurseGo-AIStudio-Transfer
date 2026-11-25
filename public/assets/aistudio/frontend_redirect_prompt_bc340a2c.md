# Prompt Google AI Studio: Perbaikan redirect autentikasi NurseGo

Audit dan perbaiki konfigurasi redirect autentikasi pada frontend NurseGo tanpa mengubah schema Supabase, menjalankan SQL, atau merombak UI.

## Tujuan
- Jangan mengirim email verifikasi/signup ke `localhost:3000` ketika aplikasi dibuka melalui Preview atau deployment.
- Gunakan URL aplikasi yang dapat dikonfigurasi melalui environment variable `VITE_APP_URL`.
- Untuk signup Supabase Auth, set `emailRedirectTo` secara eksplisit ke URL aplikasi + route callback yang memang tersedia di aplikasi. Periksa route yang ada terlebih dahulu; jangan mengarang route baru tanpa implementasi.
- Pastikan callback memproses token/code/hash Supabase sesuai flow SDK yang digunakan dan memberikan pesan sukses/gagal yang jelas.
- Untuk Preview, gunakan origin Preview yang sedang berjalan jika `VITE_APP_URL` tidak tersedia, bukan localhost hardcoded. Untuk production, `VITE_APP_URL` harus diset ke domain deployment NurseGo.
- Pastikan redirect URL tersebut cocok dengan Supabase Authentication → URL Configuration → Redirect URLs. Jangan mengklaim pengaturan dashboard telah diubah.
- Jangan menampilkan, mencetak, atau menaruh secret/service-role key di frontend.
- Pertahankan flow aktivasi pasien berbasis invitation dan jangan mengacaukan signup perawat dengan aktivasi pasien.

## Tugas
1. Temukan seluruh `signUp`, email verification, callback, redirect, `localhost:3000`, dan `window.location` hardcoded.
2. Buat satu utilitas URL aplikasi/callback yang konsisten dan gunakan di semua flow yang relevan.
3. Periksa bahwa URL redirect dipakai dengan benar oleh Supabase Auth.
4. Pastikan email template Supabase tetap menggunakan `{{ .ConfirmationURL }}` (template diatur di Dashboard, bukan kode frontend).
5. Jalankan build dan TypeScript check.
6. Laporkan file yang diubah, route callback yang dipakai, dan environment variable yang dibutuhkan—tanpa menampilkan nilai key.
7. Jangan menjalankan SQL/migrasi dan jangan mengubah backend/schema.
