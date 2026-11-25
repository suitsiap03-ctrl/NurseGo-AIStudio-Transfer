# NurseGo – Postoperative Home Care Monitoring System

Aplikasi pemantauan pemulihan pasien pascaoperasi berbasis web yang menghubungkan perawat dengan pasien dewasa yang sedang menjalani pemulihan di rumah.

## Fitur Utama

- **Portal Perawat**:
  - Pendaftaran perawat dengan verifikasi STR & pembentukan gelar resmi otomatis.
  - Dashboard pemantauan pasien aktif & penyaringan berdasarkan 7 jenis operasi (Apendektomi, Sesar/SC, Laparoskopi, TKR, ORIF, Kolesistektomi, Hernia).
  - Triage Sistem Peringatan Klinis (Waspada, Urgent, Darurat) dengan riwayat resolusi.
  - Dokumentasi Asuhan Keperawatan berstandar SDKI, SLKI, SIKI, dan SOAP terintegrasi.
  - Grafik tren interaktif SVG untuk tanda vital dan skala nyeri (NRS 0–10).
- **Portal Pasien**:
  - Aktivasi akun melalui token undangan perawat.
  - Formulir pemantauan mandiri bertahap (5 langkah) ramah pasien pascaoperasi.
  - Log kepatuhan minum obat harian.
  - Pengingat jadwal kontrol poliklinik terdekat.
  - Modul edukasi perawatan luka & panduan pemulihan khusus untuk 7 jenis operasi.
- **Dukungan Evaluasi Akademik**:
  - Terintegrasi langsung dengan Supabase PostgreSQL & Supabase Auth.
  - Tombol masuk cepat demo untuk pengujian dosen/reviewer tanpa hambatan konfigurasi.

## Teknologi

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4
- **Ikon**: Lucide React
- **Backend & Database**: Supabase (PostgreSQL, Supabase Auth, RLS)

## Menjalankan Proyek Secara Lokal

1. Klon repositori ini atau unduh berkasnya:
   ```bash
   git clone <URL_REPOSITORI>
   cd nursego
   ```

2. Pasang dependensi:
   ```bash
   npm install
   ```

3. Jalankan server pengembang:
   ```bash
   npm run dev
   ```
   Buka peramban di `http://localhost:3000`.

## Menghubungkan ke Supabase

Aplikasi NurseGo telah dikonfigurasi untuk terhubung dengan proyek Supabase:
- **Project URL**: `https://pwokxvmvyezhacjpzhuz.supabase.co`
- Masukkan Publishable Anon Key Anda melalui modal konfigurasi di dalam aplikasi (ikon database di navbar) atau melalui variabel lingkungan:
  ```env
  VITE_SUPABASE_URL="https://pwokxvmvyezhacjpzhuz.supabase.co"
  VITE_SUPABASE_ANON_KEY="<KUNCI_ANON_SUPABASE_ANDA>"
  ```

## Panduan Deploy ke Vercel

1. Buka [Vercel](https://vercel.com) dan masuk dengan akun Anda.
2. Klik **Add New Project** dan impor repositori GitHub ini.
3. Konfigurasi `vercel.json` telah disediakan secara otomatis.
4. Tambahkan variabel lingkungan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
5. Klik **Deploy**.
