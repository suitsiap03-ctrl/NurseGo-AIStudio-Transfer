/**
 * Patient Invitation Activation Page for NurseGo
 *
 * - Reads ?token=...&email=... from URL query parameters automatically (no hardcoded token)
 * - Validates invitation token against Supabase (`verify_patient_invitation` RPC)
 * - Shows patient, inviting nurse, surgery & hospital info when token is verified
 * - Normalizes patient full name on blur & submit
 * - Uses accessible PasswordInput toggles and commits active session cleanly after confirmation
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError, isSupabaseConfigured } from '../../lib/supabaseClient';
import { normalizePersonName } from '../../lib/nameUtils';
import { formatLocalDate } from '../../lib/dateUtils';
import { PasswordInput } from '../common/PasswordInput';
import {
  KeyRound,
  Mail,
  User,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Stethoscope,
  MailCheck,
  Send,
  Search,
} from 'lucide-react';

interface PatientActivationProps {
  onBackToLogin: () => void;
  onActivationSuccess: () => void;
}

interface VerifiedInvitePreview {
  token: string;
  nurseName?: string;
  patientName?: string;
  patientEmail?: string;
  surgeryName?: string;
  surgeryDate?: string;
  dischargeDate?: string;
  clinicalNotes?: string;
  hospitalName?: string;
}

export const PatientActivation: React.FC<PatientActivationProps> = ({
  onBackToLogin,
  onActivationSuccess,
}) => {
  const {
    activatePatient,
    commitPendingActivationSession,
    resendVerificationEmail,
    authError,
    setAuthError,
  } = useAuth();
  const [token, setToken] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [enteringPortal, setEnteringPortal] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<VerifiedInvitePreview | null>(null);
  const [tokenCheckMsg, setTokenCheckMsg] = useState<string | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);
  const [requiresEmailConfirm, setRequiresEmailConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const emailRef = useRef(patientEmail);
  emailRef.current = patientEmail;
  const nameRef = useRef(fullName);
  nameRef.current = fullName;

  const checkTokenDetails = async (rawToken: string) => {
    const clean = rawToken.trim().toUpperCase();
    if (!clean) return;
    setTokenPreview(null);
    if (!isSupabaseConfigured()) {
      setTokenCheckMsg(
        'Konfigurasi Supabase (VITE_SUPABASE_ANON_KEY) belum tersedia di environment aplikasi, sehingga kode undangan tidak dapat diverifikasi.'
      );
      return;
    }
    setCheckingToken(true);
    setTokenCheckMsg(null);
    const supabase = getSupabase();
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('verify_patient_invitation', {
        p_token: clean,
        p_email: null,
      });

      if (!rpcErr && rpcRes) {
        if (rpcRes.valid) {
          const normalizedInviteName = rpcRes.patient_name
            ? normalizePersonName(String(rpcRes.patient_name))
            : '';
          setTokenPreview({
            token: clean,
            nurseName: rpcRes.nurse_name || undefined,
            patientName: normalizedInviteName || undefined,
            patientEmail: rpcRes.patient_email || undefined,
            surgeryName: rpcRes.surgery_name || undefined,
            surgeryDate: rpcRes.surgery_date || undefined,
            dischargeDate: rpcRes.discharge_date || undefined,
            clinicalNotes: rpcRes.clinical_notes || undefined,
            hospitalName: rpcRes.hospital_name || undefined,
          });
          if (rpcRes.patient_email && !emailRef.current.trim()) {
            setPatientEmail(String(rpcRes.patient_email).trim().toLowerCase());
          }
          if (normalizedInviteName && !nameRef.current.trim()) {
            setFullName(normalizedInviteName);
          }
        } else {
          setTokenCheckMsg(rpcRes.reason || 'Token tidak valid, kedaluwarsa, atau sudah digunakan.');
        }
      } else {
        setTokenCheckMsg(
          isMissingRpcError(rpcErr)
            ? 'Fungsi verifikasi undangan `verify_patient_invitation` belum terpasang di Supabase. Pastikan migrasi SQL sudah dijalankan.'
            : 'Token belum dapat divalidasi otomatis sebelum aktivasi. Pastikan kode benar atau hubungi perawat.'
        );
      }
    } catch {
      setTokenCheckMsg('Tidak dapat memeriksa token saat ini. Periksa koneksi internet dan konfigurasi Supabase.');
    } finally {
      setCheckingToken(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlEmail = params.get('email');
    if (urlEmail) {
      const cleanUrlEmail = urlEmail.trim().toLowerCase();
      setPatientEmail(cleanUrlEmail);
      emailRef.current = cleanUrlEmail;
    }
    if (urlToken) {
      const upper = urlToken.trim().toUpperCase();
      setToken(upper);
      checkTokenDetails(upper);
    }
  }, []);

  const emailMismatchWarning =
    tokenPreview?.patientEmail &&
    patientEmail.trim() &&
    tokenPreview.patientEmail.trim().toLowerCase() !== patientEmail.trim().toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const normalizedName = normalizePersonName(fullName);
    if (normalizedName !== fullName) {
      setFullName(normalizedName);
    }

    if (!token.trim() || !patientEmail.trim() || !normalizedName || !password) {
      setAuthError('Mohon isi kode undangan, email, nama lengkap, dan kata sandi.');
      return;
    }
    if (emailMismatchWarning) {
      setAuthError(
        `Email tidak cocok dengan undangan (${tokenPreview?.patientEmail}). Gunakan alamat email yang terdaftar pada undangan.`
      );
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

    setLoading(true);
    try {
      const res = await activatePatient({
        email: patientEmail.trim().toLowerCase(),
        password,
        fullName: normalizedName,
        token: token.trim().toUpperCase(),
      });

      if (res.success) {
        setRequiresEmailConfirm(Boolean(res.requiresEmailConfirmation));
        setIsSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMsg(null);
    const res = await resendVerificationEmail(patientEmail);
    setResending(false);
    if (res.success) {
      setResendMsg(`Email verifikasi baru dikirim ulang ke ${patientEmail}.`);
    } else {
      setResendMsg(`Gagal mengirim ulang: ${res.error}`);
    }
  };

  const handleContinueAfterSuccess = async () => {
    if (requiresEmailConfirm) {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        url.searchParams.delete('token');
        url.searchParams.delete('email');
        const cleanSearch = url.searchParams.toString();
        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`
        );
      }
      onActivationSuccess();
      return;
    }

    setEnteringPortal(true);
    try {
      await commitPendingActivationSession();
    } finally {
      setEnteringPortal(false);
    }
  };

  if (isSuccess) {
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
            {requiresEmailConfirm ? 'Konfirmasi Email Pasien' : 'Akun Pasien Berhasil Diaktifkan!'}
          </h2>

          <p className="text-xs text-slate-600 leading-relaxed">
            Terima kasih, <strong>{fullName}</strong>. Undangan Anda telah diproses untuk terhubung
            dengan perawat pendamping di NurseGo.
          </p>

          {requiresEmailConfirm ? (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-left text-xs text-blue-900 space-y-2">
              <div className="font-semibold">Langkah Terakhir — Verifikasi Email:</div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Klik tautan konfirmasi yang dikirim Supabase Auth ke <strong>{patientEmail}</strong>.
                Setelah email terverifikasi, masuk ke Portal Pasien dan data perawatan Anda akan
                langsung tersinkron.
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
              {resendMsg && <p className="text-[11px] font-medium">{resendMsg}</p>}
            </div>
          ) : (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-left text-xs text-teal-900 space-y-1">
              <div className="font-semibold">Akun Siap Digunakan:</div>
              <p className="text-[11px] text-teal-800">
                Data operasi, profil pasien, jadwal kontrol, dan pemantauan harian Anda kini
                terhubung langsung dengan perawat penanggung jawab.
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={enteringPortal}
            onClick={handleContinueAfterSuccess}
            className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {requiresEmailConfirm
              ? 'Ke Halaman Masuk Pasien'
              : enteringPortal
              ? 'Membuka Portal Pasien...'
              : 'Masuk ke Portal Pasien'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <button
          type="button"
          onClick={() => {
            setAuthError(null);
            onBackToLogin();
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Halaman Masuk Pasien</span>
        </button>

        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Aktivasi Akun Pasien</h2>
            <p className="text-xs text-slate-500 mt-1">
              Aktivasi Akun Pemantauan Mandiri Pascaoperasi Anda
            </p>
          </div>

          {tokenPreview ? (
            <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1 text-emerald-950">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Undangan Tervalidasi</span>
              </div>
              {tokenPreview.patientName && (
                <p className="text-[11px]">
                  Pasien: <strong>{tokenPreview.patientName}</strong>
                  {tokenPreview.patientEmail ? ` (${tokenPreview.patientEmail})` : ''}
                </p>
              )}
              {tokenPreview.nurseName && (
                <p className="text-[11px]">
                  Perawat Pengundang: <strong>{tokenPreview.nurseName}</strong>
                </p>
              )}
              {tokenPreview.surgeryName && (
                <p className="text-[11px]">
                  Tindakan Operasi: <strong>{tokenPreview.surgeryName}</strong>
                  {tokenPreview.surgeryDate ? ` · ${formatLocalDate(tokenPreview.surgeryDate)}` : ''}
                </p>
              )}
              {tokenPreview.dischargeDate && (
                <p className="text-[11px]">
                  Tanggal Pulang: <strong>{formatLocalDate(tokenPreview.dischargeDate)}</strong>
                </p>
              )}
              {tokenPreview.hospitalName && (
                <p className="text-[11px]">
                  Faskes / RS: <strong>{tokenPreview.hospitalName}</strong>
                </p>
              )}
              {tokenPreview.clinicalNotes && (
                <p className="text-[11px] text-emerald-900/90">
                  Catatan Klinis: {tokenPreview.clinicalNotes}
                </p>
              )}
            </div>
          ) : (
            <div className="mb-5 p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl text-xs space-y-1.5 text-teal-950">
              <div className="flex items-center gap-1.5 font-bold text-teal-900">
                <Stethoscope className="w-4 h-4 text-teal-700" />
                <span>Undangan Asuhan Keperawatan</span>
              </div>
              <p className="text-[11px] text-teal-800 leading-relaxed">
                Masukkan kode undangan dan alamat email yang didaftarkan oleh perawat Anda di rumah sakit.
              </p>
            </div>
          )}

          {tokenCheckMsg && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{tokenCheckMsg}</span>
              </div>
              {(tokenCheckMsg.toLowerCase().includes('digunakan') ||
                tokenCheckMsg.toLowerCase().includes('accepted') ||
                tokenCheckMsg.toLowerCase().includes('masuk')) && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    onBackToLogin();
                  }}
                  className="ml-6 px-3 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold rounded-md transition-colors"
                >
                  Masuk ke Portal Pasien
                </button>
              )}
            </div>
          )}

          {emailMismatchWarning && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Email yang Anda ketik berbeda dari email pada undangan (
                <strong>{tokenPreview?.patientEmail}</strong>). Gunakan email yang sama agar
                aktivasi berhasil.
              </span>
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
              {(authError.toLowerCase().includes('sudah terdaftar') ||
                authError.toLowerCase().includes('sudah digunakan') ||
                authError.toLowerCase().includes('portal pasien')) && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    onBackToLogin();
                  }}
                  className="ml-6 px-3 py-1 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-semibold rounded-md transition-colors"
                >
                  Buka Halaman Masuk Pasien
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kode / Token Undangan *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={token}
                  onChange={(e) => {
                    const nextVal = e.target.value.toUpperCase();
                    setToken(nextVal);
                    if (tokenPreview && tokenPreview.token !== nextVal.trim()) {
                      setTokenPreview(null);
                    }
                    setTokenCheckMsg(null);
                  }}
                  onBlur={() => {
                    const clean = token.trim().toUpperCase();
                    if (clean.length >= 6 && tokenPreview?.token !== clean && !checkingToken) {
                      checkTokenDetails(clean);
                    }
                  }}
                  placeholder="Contoh: INV-8K3M2P"
                  className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono font-bold focus:bg-white text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={() => checkTokenDetails(token)}
                  disabled={checkingToken || !token.trim()}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{checkingToken ? 'Cek...' : 'Cek'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alamat Email Terdaftar Pasien *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  placeholder="pasien@gmail.com"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nama Lengkap Pasien *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => setFullName((prev) => normalizePersonName(prev))}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Buat Kata Sandi *
                </label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 karakter"
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="w-full pl-9 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ulangi Kata Sandi *
                </label>
                <PasswordInput
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Konfirmasi"
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="w-full pl-9 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              <span>{loading ? 'Mengaktifkan Akun...' : 'Aktifkan Akun Pasien'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
