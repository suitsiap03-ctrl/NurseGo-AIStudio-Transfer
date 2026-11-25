/**
 * Dedicated Password Reset Page triggered when user opens a Supabase PASSWORD_RECOVERY link.
 * Isolated from dashboards: verifies recovery session, updates password via Supabase Auth,
 * signs out of the temporary recovery session, and directs back to the matching portal login page.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PasswordInput } from '../common/PasswordInput';
import { UserRole } from '../../types/database';
import { KeyRound, Lock, CheckCircle2, AlertCircle, ArrowLeft, HeartPulse } from 'lucide-react';

interface PasswordRecoveryModalProps {
  onRedirectToLogin?: (portal: UserRole | null, successMessage?: string) => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({
  onRedirectToLogin,
}) => {
  const {
    user,
    role,
    recoveryPortal,
    isPasswordRecovery,
    updatePassword,
    finishPasswordRecovery,
  } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const effectivePortal: UserRole | null =
    role ||
    (user?.user_metadata?.role === 'nurse' || user?.user_metadata?.role === 'patient'
      ? (user.user_metadata.role as UserRole)
      : null) ||
    recoveryPortal;

  const handleGoToLogin = useCallback(
    async (withSuccessNotice: boolean) => {
      if (exiting) return;
      setExiting(true);
      try {
        const targetPortal = await finishPasswordRecovery();
        const notice = withSuccessNotice
          ? 'Kata sandi baru Anda berhasil disimpan. Silakan masuk menggunakan kata sandi baru tersebut.'
          : undefined;
        onRedirectToLogin?.(targetPortal || effectivePortal, notice);
      } finally {
        setExiting(false);
      }
    },
    [exiting, finishPasswordRecovery, onRedirectToLogin, effectivePortal]
  );

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      handleGoToLogin(true);
    }, 2200);
    return () => clearTimeout(timer);
  }, [success, handleGoToLogin]);

  if (!isPasswordRecovery) return null;

  const hasVerifiedSession = Boolean(user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hasVerifiedSession) {
      setError('Sesi pemulihan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset password baru.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const res = await updatePassword(newPassword);
      if (res.success) {
        setSuccess(true);
      } else {
        setError(res.error || 'Gagal memperbarui kata sandi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const portalLabel =
    effectivePortal === 'nurse'
      ? 'Portal Perawat'
      : effectivePortal === 'patient'
      ? 'Portal Pasien'
      : 'Halaman Masuk';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="flex items-center justify-center gap-2 text-teal-700 font-bold text-sm mb-5">
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center">
            <HeartPulse className="w-4 h-4" />
          </div>
          <span>NurseGo</span>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">Atur Ulang Kata Sandi</h1>
              <p className="text-xs text-slate-500 truncate">
                {user?.email ? `Akun: ${user.email}` : 'Verifikasi pemulihan akun NurseGo'}
              </p>
            </div>
          </div>

          {effectivePortal && (
            <div className="px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
              Alur Pemulihan: <strong>{portalLabel}</strong>
            </div>
          )}

          {!hasVerifiedSession && !success ? (
            <div className="space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  Token pemulihan kata sandi tidak aktif atau sudah kedaluwarsa. Minta tautan reset baru dari halaman login.
                </span>
              </div>
              <button
                type="button"
                disabled={exiting}
                onClick={() => handleGoToLogin(false)}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs inline-flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali ke {portalLabel}</span>
              </button>
            </div>
          ) : success ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-bold text-slate-900">Kata Sandi Berhasil Diperbarui</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Kata sandi baru Anda sudah aktif. Mengarahkan Anda ke <strong>{portalLabel}</strong> untuk masuk kembali...
                </p>
              </div>
              <button
                type="button"
                disabled={exiting}
                onClick={() => handleGoToLogin(true)}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {exiting ? 'Mengarahkan...' : `Masuk di ${portalLabel}`}
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kata Sandi Baru *</label>
                  <PasswordInput
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    leftIcon={<Lock className="w-4 h-4" />}
                    className="w-full pl-9 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Konfirmasi Kata Sandi Baru *</label>
                  <PasswordInput
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    leftIcon={<Lock className="w-4 h-4" />}
                    className="w-full pl-9 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
                </button>
              </form>

              <button
                type="button"
                disabled={exiting}
                onClick={() => handleGoToLogin(false)}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Batalkan &amp; Kembali ke {portalLabel}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

