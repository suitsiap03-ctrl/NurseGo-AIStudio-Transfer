/**
 * Supabase Configuration & Connection Diagnostics Modal
 * Allows testing and inspecting the real Supabase project connection (pwokxvmvyezhacjpzhuz)
 */

import React, { useState, useEffect } from 'react';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  ConnectionTestResult,
  PROJECT_ID,
  DEFAULT_SUPABASE_URL,
} from '../../lib/supabaseClient';
import { Database, CheckCircle2, XCircle, RefreshCw, X, ShieldCheck, Key, ExternalLink } from 'lucide-react';
import { PasswordInput } from './PasswordInput';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigUpdated,
}) => {
  const [url, setUrl] = useState<string>(DEFAULT_SUPABASE_URL);
  const [anonKey, setAnonKey] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const config = getStoredSupabaseConfig();
      setUrl(config.url || DEFAULT_SUPABASE_URL);
      setAnonKey(config.anonKey || '');
      setTestResult(null);
      setSaveSuccess(false);

      // Auto-test if key is already present
      if (config.anonKey && config.anonKey.length > 20) {
        handleTest(config.url, config.anonKey);
      }
    }
  }, [isOpen]);

  const handleTest = async (testUrl?: string, testKey?: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testSupabaseConnection(testUrl || url, testKey || anonKey);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Pengujian koneksi mengalami error.',
        technicalDetails: err.message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    saveSupabaseConfig(url, anonKey);
    setSaveSuccess(true);
    if (onConfigUpdated) onConfigUpdated();
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 900);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Status & Konfigurasi Supabase</h2>
              <p className="text-xs text-slate-500">Proyek ID: <span className="font-mono text-slate-700 font-medium">{PROJECT_ID}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-slate-800">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>Ketentuan Integrasi Nyata:</span>
            </div>
            <p>
              Supabase adalah <span className="font-medium text-slate-800">single source of truth</span> NurseGo. Gunakan <span className="font-semibold text-slate-800">Publishable / Anon Key</span> resmi dari dashboard Supabase Anda. Jangan pernah memasukkan service_role key.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://pwokxvmvyezhacjpzhuz.supabase.co"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Supabase Anon / Publishable Key
              </label>
              <a
                href={`https://supabase.com/dashboard/project/${PROJECT_ID}/settings/api`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-teal-600 hover:text-teal-700 inline-flex items-center gap-1"
              >
                <span>Buka Dashboard API</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <PasswordInput
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOi... atau sb_publishable_..."
              leftIcon={<Key className="w-4 h-4" />}
              className="w-full pl-9 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Gunakan Publishable Key (`sb_publishable_...`) atau Legacy Anon Key (`eyJ...`) untuk browser. Jangan gunakan secret/service_role key.
            </p>
          </div>

          {/* Test connection result display */}
          {testResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                testResult.success
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50/80 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
              {testResult.technicalDetails && (
                <p className="font-mono text-xs opacity-90 pl-6 break-all">
                  {testResult.technicalDetails}
                </p>
              )}
              {testResult.tablesVerified && testResult.tablesVerified.length > 0 && (
                <div className="pl-6 text-xs text-emerald-800 pt-1">
                  <span className="font-medium">Data terdeteksi: </span>
                  {testResult.tablesVerified.join(', ')}
                </div>
              )}
            </div>
          )}

          {saveSuccess && (
            <div className="p-2.5 bg-teal-50 border border-teal-200 text-teal-800 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Konfigurasi berhasil disimpan dan Supabase client diinisialisasi ulang!</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => handleTest()}
            disabled={isTesting}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Menguji Koneksi...' : 'Uji Koneksi Nyata'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors"
            >
              Simpan & Terapkan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
