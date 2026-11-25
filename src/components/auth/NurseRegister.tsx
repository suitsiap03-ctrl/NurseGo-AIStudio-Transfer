/**
 * Multi-Step Nurse Registration with Automatic Professional Title Formation
 *
 * - Stores raw `full_name` separately from `professional_title` & academic metadata
 * - Real `<input type="file">` file pickers (PDF/JPG/PNG) with Supabase Storage attempt & honest status
 * - Honest post-signup email confirmation screen with working "Kirim Ulang Email Verifikasi"
 */

import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NurseEducationLevel } from '../../types/database';
import { normalizePersonName } from '../../lib/nameUtils';
import { PasswordInput } from '../common/PasswordInput';
import {
  Stethoscope,
  FileCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  UploadCloud,
  Sparkles,
  MailCheck,
  Send
} from 'lucide-react';

interface NurseRegisterProps {
  onBackToLogin: () => void;
}

export const NurseRegister: React.FC<NurseRegisterProps> = ({ onBackToLogin }) => {
  const { signUpNurse, resendVerificationEmail, authError, setAuthError } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requiresEmailConfirm, setRequiresEmailConfirm] = useState(false);
  const [documentNotice, setDocumentNotice] = useState<string | undefined>(undefined);
  const [resendState, setResendState] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  // Step 1: Personal Data
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Education & Qualifications
  const [educationLevel, setEducationLevel] = useState<NurseEducationLevel>('s1_keperawatan');
  const [hasNersProfession, setHasNersProfession] = useState<boolean>(true);
  const [customDegree, setCustomDegree] = useState<string>('');
  const [department, setDepartment] = useState('Rawat Bedah Postoperatif');
  const [hospitalName, setHospitalName] = useState('RSUP Hasan Sadikin');

  // Step 3: STR & Documents
  const [strNumber, setStrNumber] = useState('');
  const [strExpiryDate, setStrExpiryDate] = useState('2028-12-31');
  const [strFile, setStrFile] = useState<File | null>(null);
  const [diplomaFile, setDiplomaFile] = useState<File | null>(null);

  const strInputRef = useRef<HTMLInputElement>(null);
  const diplomaInputRef = useRef<HTMLInputElement>(null);

  const generateDegreeSuffix = (): string => {
    let degree = '';
    switch (educationLevel) {
      case 'd3_keperawatan':
        degree = 'A.Md.Kep.';
        break;
      case 's1_keperawatan':
        degree = 'S.Kep.';
        break;
      case 's2_keperawatan':
        degree = hasNersProfession ? 'S.Kep., M.Kep.' : 'M.Kep.';
        break;
      case 's2_kesehatan_lain':
        degree = hasNersProfession ? 'S.Kep., M.Kes.' : 'M.Kes.';
        break;
      case 's3_keperawatan':
        degree = hasNersProfession ? 'S.Kep., Dr.Kep.' : 'Dr.';
        break;
      case 's3_kesehatan_lain':
        degree = hasNersProfession ? 'S.Kep., Ph.D.' : 'Ph.D.';
        break;
      case 'spesialis_keperawatan':
        degree = customDegree.trim() ? `S.Kep., ${customDegree.trim()}` : 'S.Kep., Sp.Kep.MB';
        break;
      default:
        degree = 'S.Kep.';
    }

    if (customDegree.trim() && educationLevel !== 'spesialis_keperawatan') {
      degree = `${degree}, ${customDegree.trim()}`;
    }

    return degree;
  };

  const generateProfessionalTitle = (): string => {
    const rawName = normalizePersonName(fullName) || 'Nama Perawat';
    const prefix = hasNersProfession ? 'Ns. ' : '';
    return `${prefix}${rawName}, ${generateDegreeSuffix()}`;
  };

  const currentProfessionalTitle = generateProfessionalTitle();

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (step === 1) {
      const normalizedName = normalizePersonName(fullName);
      if (normalizedName !== fullName) setFullName(normalizedName);
      if (!normalizedName || !email.trim() || !phone.trim() || !password) {
        setAuthError('Mohon isi semua data pribadi.');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
      if (password.length < 6) {
        setAuthError('Kata sandi minimal 6 karakter.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!strNumber || strNumber.trim().length < 8) {
      setAuthError('Mohon masukkan nomor STR perawat yang valid (minimal 8-16 digit).');
      return;
    }

    const normalizedName = normalizePersonName(fullName);
    setFullName(normalizedName);

    setLoading(true);
    try {
      const res = await signUpNurse({
        email: email.trim(),
        password,
        fullName: normalizedName,
        professionalTitle: currentProfessionalTitle,
        educationLevel,
        hasNersProfession,
        academicDegree: generateDegreeSuffix(),
        strNumber: strNumber.trim(),
        strExpiryDate,
        department,
        hospitalName,
        phone: phone.trim(),
        strFile,
        diplomaFile,
      });

      if (res.success) {
        setRequiresEmailConfirm(Boolean(res.requiresEmailConfirmation));
        setDocumentNotice(res.documentNotice);
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendState(null);
    const res = await resendVerificationEmail(email);
    setResending(false);
    if (res.success) {
      setResendState(`Email verifikasi baru dikirim ulang ke ${email}. Periksa inbox/spam Anda.`);
    } else {
      setResendState(`Gagal mengirim ulang: ${res.error}`);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            {requiresEmailConfirm ? (
              <MailCheck className="w-9 h-9 text-teal-600" />
            ) : (
              <CheckCircle2 className="w-10 h-10" />
            )}
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            {requiresEmailConfirm ? 'Verifikasi Email Diperlukan' : 'Pendaftaran Perawat Berhasil!'}
          </h2>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2">
            <div>
              <span className="text-slate-500">Nama Asli:</span>
              <p className="font-bold text-slate-900">{fullName}</p>
            </div>
            <div>
              <span className="text-slate-500">Gelar Profesional Terdaftar:</span>
              <p className="font-bold text-teal-800 text-sm">{currentProfessionalTitle}</p>
            </div>
            <div>
              <span className="text-slate-500">Nomor STR:</span>
              <p className="font-mono text-slate-800">{strNumber}</p>
            </div>
            <div>
              <span className="text-slate-500">Status Verifikasi STR:</span>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                Menunggu Verifikasi Dokumen
              </span>
            </div>
          </div>

          {requiresEmailConfirm ? (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-left text-xs text-blue-900 space-y-2">
              <p className="font-semibold">Konfirmasi Email Anda:</p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Tautan aktivasi telah dikirim oleh Supabase Auth ke <strong>{email}</strong>. Klik tautan pada email tersebut sebelum masuk ke Portal Perawat.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 text-blue-800 rounded-lg font-semibold hover:bg-blue-100 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{resending ? 'Mengirim...' : 'Kirim Ulang Email Verifikasi'}</span>
              </button>
              {resendState && <p className="text-[11px] font-medium text-blue-950">{resendState}</p>}
            </div>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              Akun Anda sudah aktif di database NurseGo dan siap digunakan untuk mendampingi pasien pascaoperasi.
            </p>
          )}

          {documentNotice && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 text-left">
              {documentNotice}
            </div>
          )}

          <button
            onClick={onBackToLogin}
            className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
          >
            Ke Halaman Masuk Perawat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => {
            setAuthError(null);
            onBackToLogin();
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Halaman Masuk</span>
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="bg-slate-900 p-6 text-white text-center">
            <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-400/30 text-teal-300 flex items-center justify-center mx-auto mb-2">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold">Registrasi Akun Perawat</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Sistem Informasi Keperawatan Pascaoperasi NurseGo
            </p>
          </div>

          <div className="grid grid-cols-3 bg-slate-100 p-2 text-xs font-semibold border-b border-slate-200 text-center">
            <div className={`py-1.5 rounded-lg ${step === 1 ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500'}`}>
              1. Data Pribadi
            </div>
            <div className={`py-1.5 rounded-lg ${step === 2 ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500'}`}>
              2. Kualifikasi & Gelar
            </div>
            <div className={`py-1.5 rounded-lg ${step === 3 ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500'}`}>
              3. STR & Berkas
            </div>
          </div>

          <div className="p-6">
            {authError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {step === 1 && (
              <form onSubmit={handleNextStep} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Lengkap (Tanpa Gelar) *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={() => setFullName((prev) => normalizePersonName(prev))}
                    placeholder="Contoh: Andi Pratama (gelar dibentuk otomatis di langkah 2)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white text-sm"
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Gunakan nama asli sesuai KTP/Ijazah tanpa menuliskan gelar di kolom ini.
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Alamat Email Resmi *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="perawat.andi@hospital.org"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor Telepon / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white text-sm font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Kata Sandi Baru *
                    </label>
                    <PasswordInput
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 karakter"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Konfirmasi Kata Sandi *
                    </label>
                    <PasswordInput
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Lanjut ke Kualifikasi & Gelar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleNextStep} className="space-y-4 text-xs">
                <div className="p-4 bg-teal-50/80 border-2 border-teal-500 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-teal-800">
                    <span className="font-bold flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      Pratinjau Nama Profesional (Gelar Otomatis)
                    </span>
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded font-mono border border-teal-200">
                      Live Preview
                    </span>
                  </div>
                  <div className="text-base font-extrabold text-teal-950 font-sans tracking-tight">
                    {currentProfessionalTitle}
                  </div>
                  <p className="text-[11px] text-teal-700">
                    Nama asli dan gelar profesional disimpan terpisah di database.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pendidikan Keperawatan Terakhir *
                  </label>
                  <select
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value as NurseEducationLevel)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold"
                  >
                    <option value="d3_keperawatan">D3 Keperawatan (A.Md.Kep.)</option>
                    <option value="s1_keperawatan">S1 Keperawatan (S.Kep.)</option>
                    <option value="s2_keperawatan">S2 Keperawatan (M.Kep.)</option>
                    <option value="s2_kesehatan_lain">S2 Bidang Kesehatan Lainnya (M.Kes. / M.Sc.)</option>
                    <option value="s3_keperawatan">S3 Keperawatan (Doktor Keperawatan)</option>
                    <option value="s3_kesehatan_lain">S3 Bidang Kesehatan Lainnya (Ph.D.)</option>
                    <option value="spesialis_keperawatan">Pendidikan Spesialis Keperawatan (Sp.Kep.)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Status Pendidikan Profesi Ners *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setHasNersProfession(true)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        hasNersProfession
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="font-semibold">Sudah Profesi Ners</div>
                      <div className="text-[10px] text-slate-400">Gelar diawali "Ns."</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHasNersProfession(false)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        !hasNersProfession
                          ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="font-semibold">Belum Profesi Ners</div>
                      <div className="text-[10px] text-slate-400">Tanpa awalan "Ns."</div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Gelar Tambahan Sesuai Ijazah (Opsional)
                  </label>
                  <input
                    type="text"
                    value={customDegree}
                    onChange={(e) => setCustomDegree(e.target.value)}
                    placeholder="Contoh: Sp.Kep.MB atau M.Kes."
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Departemen / Ruangan
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Rawat Bedah"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Rumah Sakit / Faskes Mitra
                    </label>
                    <input
                      type="text"
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      placeholder="RSUP Hasan Sadikin"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-1/3 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2"
                  >
                    <span>Lanjut ke Verifikasi STR</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={handleFinalSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor STR (Surat Tanda Registrasi) Perawat *
                  </label>
                  <input
                    type="text"
                    required
                    value={strNumber}
                    onChange={(e) => setStrNumber(e.target.value)}
                    placeholder="Contoh: 1234567890123456"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Masa Berlaku STR
                  </label>
                  <input
                    type="date"
                    value={strExpiryDate}
                    onChange={(e) => setStrExpiryDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-semibold text-slate-700">
                    Unggah Dokumen STR & Ijazah (Opsional, PDF/JPG/PNG)
                  </label>

                  <input
                    ref={strInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setStrFile(e.target.files?.[0] || null)}
                  />
                  <input
                    ref={diplomaInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setDiplomaFile(e.target.files?.[0] || null)}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => strInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-teal-400 rounded-xl p-3 text-center space-y-1 transition-colors"
                    >
                      <UploadCloud className="w-5 h-5 text-teal-600 mx-auto" />
                      <div className="text-[11px] font-semibold text-slate-700">Berkas STR Perawat</div>
                      <span className="text-[10px] text-teal-700 block truncate">
                        {strFile ? `✓ ${strFile.name}` : '+ Pilih File PDF/JPG'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => diplomaInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-teal-400 rounded-xl p-3 text-center space-y-1 transition-colors"
                    >
                      <UploadCloud className="w-5 h-5 text-teal-600 mx-auto" />
                      <div className="text-[11px] font-semibold text-slate-700">Ijazah & Sertifikat</div>
                      <span className="text-[10px] text-teal-700 block truncate">
                        {diplomaFile ? `✓ ${diplomaFile.name}` : '+ Pilih File PDF/JPG'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-amber-700" />
                    Status Verifikasi Awal: Menunggu Verifikasi
                  </span>
                  <p className="text-amber-800">
                    Anda dapat langsung mendampingi pasien sementara dokumen STR Anda ditinjau oleh admin klinis.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="w-1/3 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-2/3 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>{loading ? 'Mendaftarkan Perawat...' : 'Selesaikan Pendaftaran'}</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
