/**
 * Nurse Login Page for NurseGo
 *
 * - Real Supabase Auth login with strict 'nurse' role check
 * - Real Supabase resetPasswordForEmail & resend verification email UI
 * - Clear separation of Academic Demo button
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PasswordInput } from '../common/PasswordInput';
import {
  Stethoscope,
  Lock,
  Mail,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Send
} from 'lucide-react';

interface NurseLoginProps {
  onBackToPortalSelector: () => void;
  onGoToRegister: () => void;
  onSelectDemo: () => void;
  externalSuccessMsg?: string | null;
  onDismissExternalSuccess?: () => void;
}

export const NurseLogin: React.FC<NurseLoginProps> = ({
  onBackToPortalSelector,
  onGoToRegister,
  onSelectDemo,
  externalSuccessMsg,
  onDismissExternalSuccess,
}) => {
  const { signIn, resetPassword, resendVerificationEmail, authError, setAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  // Real Password Reset State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Resend verification state
  const [resendLoading, setResendLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setAuthError(null);
    setResendStatus(null);
    try {
      await signIn(email, password, 'nurse', rememberMe);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetStatus(null);
    try {
      const res = await resetPassword(resetEmail.trim(), 'nurse');
      if (res.success) {
        setResetStatus({
          type: 'success',
          text: `Permintaan reset kata sandi telah diproses oleh Supabase Auth untuk ${resetEmail.trim()}. Periksa kotak masuk atau folder spam Anda. Jika email tidak masuk, pastikan SMTP & Redirect URL sudah aktif di Dashboard Supabase.`,
        });
      } else {
        setResetStatus({
          type: 'error',
          text: res.error || 'Gagal mengirim email reset kata sandi.',
        });
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) return;
    setResendLoading(true);
    setResendStatus(null);
    try {
      const res = await resendVerificationEmail(email.trim());
      if (res.success) {
        setResendStatus({
          type: 'success',
          text: `Tautan verifikasi baru dikirim ulang ke ${email.trim()}. Periksa kotak masuk atau folder spam Anda.`,
        });
      } else {
        setResendStatus({
          type: 'error',
          text: res.error || 'Gagal mengirim ulang email verifikasi.',
        });
      }
    } finally {
      setResendLoading(false);
    }
  };

  const needsEmailConfirm = Boolean(authError && authError.toLowerCase().includes('belum dikonfirmasi'));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <button
          onClick={() => {
            setAuthError(null);
            onBackToPortalSelector();
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Pilihan Peran</span>
        </button>

        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto mb-3">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Masuk sebagai Perawat</h2>
            <p className="text-xs text-slate-500 mt-1">
              Portal Asuhan & Pemantauan Pasien Pascaoperasi
            </p>
          </div>

          {externalSuccessMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{externalSuccessMsg}</span>
              </div>
              {onDismissExternalSuccess && (
                <button
                  type="button"
                  onClick={onDismissExternalSuccess}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0"
                >
                  Tutup
                </button>
              )}
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
              {needsEmailConfirm && email.trim() && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-rose-300 text-rose-700 rounded-md font-semibold hover:bg-rose-100 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{resendLoading ? 'Mengirim...' : 'Kirim Ulang Email Verifikasi'}</span>
                </button>
              )}
            </div>
          )}

          {resendStatus && (
            <div
              className={`mb-4 p-3 rounded-lg text-xs border flex items-start gap-2 ${
                resendStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {resendStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{resendStatus.text}</span>
            </div>
          )}

          {showForgotPassword && (
            <form
              onSubmit={handleResetPassword}
              className="mb-5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">Reset Kata Sandi via Email</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetStatus(null);
                  }}
                  className="text-[11px] text-blue-700 underline font-semibold"
                >
                  Tutup
                </button>
              </div>
              <p className="text-[11px] text-blue-800">
                Masukkan alamat email akun perawat Anda untuk menerima tautan pemulihan kata sandi dari Supabase Auth.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="perawat@rumah-sakit.id"
                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-slate-900"
                />
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg disabled:opacity-50"
                >
                  {resetLoading ? 'Mengirim...' : 'Kirim'}
                </button>
              </div>
              {resetStatus && (
                <p
                  className={`text-[11px] p-2 rounded-lg border ${
                    resetStatus.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {resetStatus.text}
                </p>
              )}
            </form>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alamat Email Perawat
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="perawat@rumah-sakit.id"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kata Sandi
              </label>
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="w-4 h-4" />}
                className="w-full pl-9 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span>Ingat sesi masuk</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setShowForgotPassword(true);
                }}
                className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
              >
                Lupa password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Memverifikasi...' : 'Masuk sebagai Perawat'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-3">
            <p className="text-xs text-slate-600">
              Belum memiliki akun perawat?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  onGoToRegister();
                }}
                className="font-bold text-teal-700 hover:text-teal-900 hover:underline"
              >
                Daftar sekarang
              </button>
            </p>

            <div className="pt-2 border-t border-dashed border-slate-200">
              <span className="block text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
                Mode Pratinjau Offline (Tanpa Database)
              </span>
              <button
                type="button"
                onClick={onSelectDemo}
                className="w-full py-2 px-3 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors border border-teal-200/80 inline-flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>Coba Demo Perawat (Data Simulasi)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
