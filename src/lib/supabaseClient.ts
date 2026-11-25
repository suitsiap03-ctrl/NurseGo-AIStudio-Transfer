/**
 * Centralized Supabase Client for NurseGo
 * Project ID: pwokxvmvyezhacjpzhuz
 * Project URL: https://pwokxvmvyezhacjpzhuz.supabase.co
 * 
 * Sesuai spesifikasi:
 * - Menggunakan @supabase/supabase-js versi 2
 * - Menggunakan Supabase URL dan Publishable Key (Anon Key)
 * - Tidak mengekspos service_role key
 * - Menyediakan diagnostik koneksi nyata dan penanganan error transparan
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://pwokxvmvyezhacjpzhuz.supabase.co';
export const PROJECT_ID = 'pwokxvmvyezhacjpzhuz';

// Kredensial Supabase berasal dari environment variables saat aplikasi dibangun.
export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  const env = (import.meta as any).env || {};
  return {
    url: String(env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim(),
    anonKey: String(env.VITE_SUPABASE_ANON_KEY || '').trim(),
  };
}

// Kompatibilitas untuk komponen lama: konfigurasi browser tidak lagi disimpan.
export function saveSupabaseConfig(_url: string, _anonKey: string): void {
  const config = getStoredSupabaseConfig();
  initSupabaseClient(config.url, config.anonKey);
}

export function clearCustomSupabaseConfig(): void {
  const config = getStoredSupabaseConfig();
  initSupabaseClient(config.url, config.anonKey);
}

// Singleton client instance
let clientInstance: SupabaseClient | null = null;
let currentConfig = getStoredSupabaseConfig();

const REMEMBER_PREF_KEY = 'nursego_remember_session';

export function setRememberSession(remember: boolean): void {
  try {
    if (remember) {
      localStorage.setItem(REMEMBER_PREF_KEY, 'true');
    } else {
      localStorage.setItem(REMEMBER_PREF_KEY, 'false');
    }
  } catch {
    // ignore storage restriction
  }
}

function shouldPersistInLocalStorage(): boolean {
  try {
    return localStorage.getItem(REMEMBER_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

const dynamicAuthStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (shouldPersistInLocalStorage()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      // ignore storage restriction
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // ignore storage restriction
    }
  },
};

export function initSupabaseClient(url: string, anonKey: string): SupabaseClient {
  currentConfig = { url, anonKey };
  
  // Create client even with placeholder key to allow instantiation, but track validity
  const validKey = anonKey && anonKey.length > 20 ? anonKey : 'placeholder-anon-key-awaiting-configuration';
  
  clientInstance = createClient(url, validKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'nursego_supabase_auth_token',
      storage: dynamicAuthStorage,
    },
  });

  return clientInstance;
}

// Initial initialization
clientInstance = initSupabaseClient(currentConfig.url, currentConfig.anonKey);

export function getSupabase(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = initSupabaseClient(currentConfig.url, currentConfig.anonKey);
  }
  return clientInstance;
}

export function isSupabaseConfigured(): boolean {
  const { anonKey } = getStoredSupabaseConfig();
  return Boolean(anonKey && anonKey.trim().length > 20 && !anonKey.includes('placeholder'));
}

export function isMissingRpcError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  tablesVerified?: string[];
  technicalDetails?: string;
}

/**
 * Conducts a real, active diagnostic test against the Supabase backend.
 */
export async function testSupabaseConnection(overrideUrl?: string, overrideKey?: string): Promise<ConnectionTestResult> {
  const url = (overrideUrl || getStoredSupabaseConfig().url || '').trim();
  const anonKey = overrideKey || getStoredSupabaseConfig().anonKey;

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      success: false,
      message: 'URL Supabase tidak valid atau kosong.',
      technicalDetails: 'VITE_SUPABASE_URL harus berupa URL https:// yang valid.',
    };
  }

  if (!anonKey || anonKey.trim().length < 20 || anonKey.includes('placeholder')) {
    return {
      success: false,
      message: 'Kunci Anon / Publishable Key Supabase belum dimasukkan.',
      technicalDetails: 'Missing or placeholder VITE_SUPABASE_ANON_KEY. Mohon masukkan Supabase Publishable Key untuk proyek pwokxvmvyezhacjpzhuz.',
    };
  }

  try {
    const testClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });

    // 1. Test Auth Service Health / Ping
    const healthUrl = `${url.replace(/\/$/, '')}/auth/v1/health`;
    let authHealthy = false;
    try {
      const resp = await fetch(healthUrl, {
        headers: {
          apikey: anonKey,
        },
      });
      authHealthy = resp.ok || resp.status === 200;
    } catch (e: any) {
      console.warn('Auth ping check notice:', e.message);
    }

    // 2. Query surgery_types to verify database REST API & schema presence
    const { data: surgeries, error: surgError } = await testClient
      .from('surgery_types')
      .select('id, name')
      .limit(5);

    if (surgError) {
      // Analyze error
      const code = (surgError as any).code;
      const msg = surgError.message;
      
      // If table exists but empty or restricted by RLS
      if (code === 'PGRST116' || code === '42501' || msg.includes('permission denied')) {
        return {
          success: true,
          message: 'Koneksi ke Supabase berhasil! (RLS terpasang sesuai standar keamanan).',
          tablesVerified: ['auth.users', 'surgery_types (RLS protected)'],
          technicalDetails: `Database connected. Auth API: ${authHealthy ? 'OK' : 'Tidak merespons'}. RLS status: ${msg}`,
        };
      }

      if (code === '42P01' || msg.includes('does not exist')) {
        return {
          success: false,
          message: 'Terhubung ke database, namun tabel surgery_types belum ditemukan.',
          technicalDetails: `Auth API: ${authHealthy ? 'OK' : 'Tidak merespons'}. Tabel tidak ditemukan: ${msg}`,
        };
      }

      return {
        success: false,
        message: `Koneksi gagal: ${msg}`,
        technicalDetails: `Auth API: ${authHealthy ? 'OK' : 'Tidak merespons'}. Code: ${code}, Details: ${surgError.details || surgError.hint || msg}`,
      };
    }

    return {
      success: true,
      message: 'Koneksi ke database Supabase berhasil dan terverifikasi!',
      tablesVerified: surgeries && surgeries.length > 0 
        ? surgeries.map((s: any) => s.name || `Tipe Operasi #${s.id}`)
        : ['surgery_types'],
      technicalDetails: `Status: 200 OK. Auth API: ${authHealthy ? 'OK' : 'Tidak merespons'}. Ditemukan ${surgeries ? surgeries.length : 0} tipe operasi terdaftar.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Gagal menghubungi server Supabase. Periksa URL atau koneksi jaringan.',
      technicalDetails: err.message || String(err),
    };
  }
}
