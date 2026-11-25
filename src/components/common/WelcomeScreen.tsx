/**
 * Halaman Awal dan Pilihan Portal (Welcome & Portal Selector) for NurseGo
 * 
 * Sesuai Bagian 2 Master Prompt:
 * - Logo & identitas NurseGo
 * - Sapaan "Selamat Datang di NurseGo"
 * - Kalimat "Silakan pilih sesuai peran Anda"
 * - Dua kartu pilihan seragam: Perawat & Pasien
 * - Kedua pilihan mengarahkan ke alur portal yang berbeda
 * - Dukungan Mode Demonstrasi Akademik untuk pengujian langsung oleh Dosen/Reviewer
 */

import React from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import {
  HeartPulse,
  Stethoscope,
  User,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

interface WelcomeScreenProps {
  onSelectRole: (role: 'nurse' | 'patient') => void;
  onSelectDemo: (role: 'nurse' | 'patient') => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSelectRole,
  onSelectDemo,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="w-full bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900">NurseGo</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] text-teal-800 bg-teal-50 px-2 py-0.5 rounded font-medium border border-teal-200">
                Postoperative Home Care
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 max-w-4xl mx-auto w-full text-center">
        {/* Hero Branding */}
        <div className="space-y-3 max-w-xl mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Sistem Informasi Pemantauan Pascaoperasi</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 text-balance">
            Selamat Datang di NurseGo
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed text-balance">
            Aplikasi pemantauan pemulihan pasien pascaoperasi yang menghubungkan pasien dengan perawat untuk memantau tanda vital, rasa nyeri, kondisi luka, dan jadwal obat di rumah.
          </p>

          <p className="text-xs font-semibold uppercase tracking-wider text-teal-800 pt-2">
            Silakan pilih sesuai peran Anda:
          </p>
        </div>

        {/* Dual Portal Selection Cards (Bagian 2) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl text-left">
          {/* KARTU PERAWAT */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-teal-500 p-6 sm:p-8 transition-all hover:shadow-lg flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors shadow-xs">
                <Stethoscope className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                  Portal Perawat
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Kelola pasien dan pantau perkembangan pemulihan mereka. Buat asuhan keperawatan, tindak lanjuti peringatan klinis, dan atur instruksi obat serta jadwal kontrol.
                </p>
              </div>

              <div className="pt-2 text-[11px] text-slate-600 space-y-1 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Daftar dengan Nomor STR resmi</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Triage peringatan Waspada, Urgent & Darurat</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Dokumentasi SDKI, SLKI, SIKI & SOAP</span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <button
                onClick={() => onSelectRole('nurse')}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>Masuk sebagai Perawat</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onSelectDemo('nurse')}
                className="w-full py-2 px-3 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors border border-teal-200/80 flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Coba Demo Akun Perawat</span>
              </button>
            </div>
          </div>

          {/* KARTU PASIEN */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 hover:border-teal-500 p-6 sm:p-8 transition-all hover:shadow-lg flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors shadow-xs">
                <User className="w-7 h-7" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                  Portal Pasien
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Pantau kondisi kesehatan dan perkembangan pemulihan Anda di rumah. Laporkan tanda vital, skala nyeri, periksa kondisi luka, dan catat jadwal minum obat.
                </p>
              </div>

              <div className="pt-2 text-[11px] text-slate-600 space-y-1 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Akun melalui aktivasi undangan perawat</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Pengisian pemantauan harian bertahap & mudah</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Panduan edukasi 7 jenis operasi pascaoperasi</span>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <button
                onClick={() => onSelectRole('patient')}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <span>Masuk sebagai Pasien</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onSelectDemo('patient')}
                className="w-full py-2 px-3 text-[11px] font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Coba Demo Akun Pasien</span>
              </button>
            </div>
          </div>
        </div>

        {/* Academic Prototype Notice */}
        <div className="mt-10 p-3 bg-slate-100/80 rounded-xl border border-slate-200 max-w-xl text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            NurseGo dikembangkan untuk demonstrasi akademik dan pengujian asuhan keperawatan pascaoperasi. Sistem bukan pengganti evaluasi klinis langsung tenaga kesehatan.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 px-4">
        NurseGo – Postoperative Home Care Monitoring System · Terintegrasi Supabase
      </footer>
    </div>
  );
};
