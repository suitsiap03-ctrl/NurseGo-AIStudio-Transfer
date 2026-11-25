/**
 * Authentication & Role Authorization Context for NurseGo
 *
 * - Menggunakan Supabase Auth sebagai pengendali akses sebenarnya
 * - Pengambilan profil & peran otoritatif dari tabel `profiles` berdasarkan auth.uid()
 * - Memisahkan secara eksplisit Mode Demo Akademik (`isDemoMode`) dari akun nyata
 * - Mendukung verifikasi email, kirim ulang email aktivasi, reset kata sandi nyata, dan sinkronisasi pasca-verifikasi
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, isMissingRpcError, isSupabaseConfigured, setRememberSession } from '../lib/supabaseClient';
import { getAuthCallbackUrl } from '../lib/appUrl';
import { normalizePersonName } from '../lib/nameUtils';
import {
  Profile,
  NurseProfile,
  PatientProfile,
  PatientSurgery,
  UserRole,
  NurseEducationLevel,
} from '../types/database';
import { DEMO_NURSE, DEMO_PATIENTS } from '../data/mockData';

export interface SignUpNursePayload {
  email: string;
  password: string;
  fullName: string; // Raw name without title
  professionalTitle: string;
  educationLevel: NurseEducationLevel;
  hasNersProfession: boolean;
  academicDegree?: string;
  strNumber: string;
  strExpiryDate?: string;
  department?: string;
  hospitalName?: string;
  phone?: string;
  strFile?: File | null;
  diplomaFile?: File | null;
}

export interface SignUpNurseResult {
  success: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
  documentNotice?: string;
}

export interface ActivatePatientResult {
  success: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  nurseProfile: NurseProfile | null;
  patientProfile: PatientProfile | null;
  patientSurgery: PatientSurgery | null;
  role: UserRole | null;
  isDemoMode: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  recoveryPortal: UserRole | null;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  clearPasswordRecovery: () => void;
  finishPasswordRecovery: () => Promise<UserRole | null>;
  signIn: (
    email: string,
    password: string,
    expectedRole?: UserRole,
    rememberMe?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  signUpNurse: (data: SignUpNursePayload) => Promise<SignUpNurseResult>;
  activatePatient: (data: {
    email: string;
    password: string;
    fullName: string;
    token: string;
  }) => Promise<ActivatePatientResult>;
  resetPassword: (email: string, portal?: UserRole) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  loginAsDemo: (demoRole: 'nurse' | 'patient') => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  commitPendingActivationSession: () => Promise<void>;
  recheckConfiguration: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const RECOVERY_PORTAL_STORAGE_KEY = 'nursego_recovery_portal_ctx';
const ACTIVE_RECOVERY_UID_KEY = 'nursego_active_recovery_uid';

function saveRecoveryPortalHint(portal: UserRole) {
  try {
    localStorage.setItem(
      RECOVERY_PORTAL_STORAGE_KEY,
      JSON.stringify({ portal, at: Date.now() })
    );
  } catch {
    // ignore storage restriction
  }
}

function readRecoveryPortalHint(): UserRole | null {
  try {
    const raw = localStorage.getItem(RECOVERY_PORTAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number' || Date.now() - parsed.at > 60 * 60 * 1000) {
      localStorage.removeItem(RECOVERY_PORTAL_STORAGE_KEY);
      return null;
    }
    return parsed.portal === 'nurse' || parsed.portal === 'patient' ? parsed.portal : null;
  } catch {
    return null;
  }
}

function clearRecoveryStorageMarkers() {
  try {
    localStorage.removeItem(RECOVERY_PORTAL_STORAGE_KEY);
    sessionStorage.removeItem(ACTIVE_RECOVERY_UID_KEY);
  } catch {
    // ignore storage restriction
  }
}

function urlHasRecoveryMarker(): boolean {
  if (typeof window === 'undefined') return false;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return (
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery' ||
    searchParams.get('flow') === 'recovery'
  );
}

export function isRecoverySession(session: Session | null): boolean {
  if (!session) return false;
  try {
    const token = session.access_token;
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        if (
          Array.isArray(payload?.amr) &&
          payload.amr.some((entry: any) => entry?.method === 'recovery')
        ) {
          return true;
        }
      }
    }
  } catch {
    // ignore malformed JWT payload
  }
  try {
    const activeUid = sessionStorage.getItem(ACTIVE_RECOVERY_UID_KEY);
    if (activeUid && session.user?.id === activeUid) {
      return true;
    }
  } catch {
    // ignore storage restriction
  }
  return false;
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('load failed') ||
    lower.includes('timeout')
  ) {
    return 'Gagal terhubung ke server Supabase. Periksa koneksi internet Anda lalu coba lagi.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah. Silakan periksa kembali.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email Anda belum dikonfirmasi. Silakan cek kotak masuk/spam email Anda atau kirim ulang tautan verifikasi.';
  }
  if (lower.includes('already registered') || lower.includes('user already exists')) {
    return 'Alamat email ini sudah terdaftar dalam sistem.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('security purposes')) {
    return 'Terlalu banyak permintaan ke server autentikasi. Mohon tunggu beberapa saat lalu coba lagi.';
  }
  if (lower.includes('password should be at least')) {
    return 'Kata sandi minimal harus 6 karakter.';
  }
  if (lower.includes('unable to validate email')) {
    return 'Format alamat email tidak valid.';
  }
  if (lower.includes('expired') || lower.includes('invalid token')) {
    return 'Tautan atau token sudah kedaluwarsa atau tidak valid.';
  }
  return message;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nurseProfile, setNurseProfile] = useState<NurseProfile | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [patientSurgery, setPatientSurgery] = useState<PatientSurgery | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => urlHasRecoveryMarker());
  const [recoveryPortal, setRecoveryPortal] = useState<UserRole | null>(() => readRecoveryPortalHint());
  const [isConfiguredState, setIsConfiguredState] = useState<boolean>(isSupabaseConfigured());
  const handledInitialUserRef = useRef<string | null>(null);
  const lastProfileErrorRef = useRef<string | null>(null);
  const inFlightActivationRef = useRef<boolean>(false);
  const deferredActivationSessionRef = useRef<{ user: User; session: Session } | null>(null);
  const isPasswordRecoveryRef = useRef<boolean>(isPasswordRecovery);
  isPasswordRecoveryRef.current = isPasswordRecovery;

  const recheckConfiguration = useCallback(() => {
    setIsConfiguredState(isSupabaseConfigured());
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
    isPasswordRecoveryRef.current = false;
    setRecoveryPortal(null);
    clearRecoveryStorageMarkers();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const hasRecoveryQuery = params.get('type') === 'recovery' || params.get('flow') === 'recovery';
      if (window.location.hash.includes('type=recovery') || hasRecoveryQuery) {
        if (hasRecoveryQuery) {
          params.delete('type');
          params.delete('flow');
        }
        const cleanSearch = params.toString();
        window.history.replaceState(
          {},
          document.title,
          `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`
        );
      }
    }
  }, []);

  /**
   * Ensures profile, role-specific record, and pending invitation activation are synced to DB
   * once a user has an active authenticated session (important when email confirmation delayed initial writes).
   */
  const syncPendingMetadataOnLogin = useCallback(async (authUser: User) => {
    const supabase = getSupabase();
    const meta = authUser.user_metadata || {};

    const { data: existingProf, error: profLookupErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profLookupErr) {
      throw new Error(`Gagal memeriksa tabel profiles: ${profLookupErr.message}`);
    }

    const targetRole: UserRole =
      (existingProf?.role as UserRole) ||
      (meta.role === 'nurse' || meta.role === 'patient' ? meta.role : 'patient');

    if (!existingProf) {
      const normalizedMetaName =
        normalizePersonName(String(meta.full_name || '')) ||
        authUser.email?.split('@')[0] ||
        'Pengguna NurseGo';
      const { error: profUpsertErr } = await supabase.from('profiles').upsert({
        id: authUser.id,
        email: authUser.email || '',
        full_name: normalizedMetaName,
        role: targetRole,
        phone: meta.phone || null,
      });
      if (profUpsertErr) {
        throw new Error(`Gagal menyinkronkan profil pengguna ke database: ${profUpsertErr.message}`);
      }
    }

    if (targetRole === 'nurse') {
      const { data: existingNurse, error: nurseCheckErr } = await supabase
        .from('nurse_profiles')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (nurseCheckErr) {
        console.warn('Nurse profile sync check notice:', nurseCheckErr.message);
      }

      if (!existingNurse) {
        const { error: nurseUpsertErr } = await supabase.from('nurse_profiles').upsert({
          id: authUser.id,
          str_number: meta.str_number || '',
          str_expiry_date: meta.str_expiry_date || null,
          verification_status: 'pending',
          education_level: meta.education_level || null,
          has_ners_profession: Boolean(meta.has_ners_profession),
          academic_degree: meta.academic_degree || null,
          professional_title: meta.professional_title || meta.full_name || null,
          department: meta.department || 'Rawat Bedah Postoperatif',
          hospital_name: meta.hospital_name || 'RS / Klinik Mitra',
        });
        if (nurseUpsertErr) {
          throw new Error(`Gagal menyinkronkan profil perawat: ${nurseUpsertErr.message}`);
        }
      }
    } else if (targetRole === 'patient') {
      const { data: existingPat, error: patLookupErr } = await supabase
        .from('patient_profiles')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (patLookupErr) {
        console.warn('Patient profile sync check notice:', patLookupErr.message);
      }

      if (!existingPat) {
        const { error: patUpsertErr } = await supabase
          .from('patient_profiles')
          .upsert({ id: authUser.id });
        if (patUpsertErr) {
          throw new Error(`Gagal menyinkronkan profil pasien: ${patUpsertErr.message}`);
        }
      }

      if (meta.invitation_token && !inFlightActivationRef.current) {
        // Complete activation idempotently via SECURITY DEFINER RPC only (never bypass RLS)
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('complete_patient_activation', {
          p_token: meta.invitation_token,
        });
        if (rpcErr) {
          console.warn('complete_patient_activation RPC notice:', rpcErr.message);
          setAuthError(
            isMissingRpcError(rpcErr)
              ? 'Fungsi `complete_patient_activation` belum tersedia di Supabase. Jalankan migrasi SQL 004 agar penautan perawat dapat diproses.'
              : `Aktivasi penautan perawat belum selesai: ${rpcErr.message}`
          );
        } else if (rpcRes && rpcRes.success === false && rpcRes.reason) {
          console.warn('complete_patient_activation notice:', rpcRes.reason);
        } else if (rpcRes?.success === true) {
          // Clear token from user_metadata so future logins do not re-trigger nurse activation notifications
          await supabase.auth.updateUser({ data: { invitation_token: null } }).catch(() => undefined);
        }
      }
    }
  }, []);

  // Fetch full user profile & role-specific profile based on auth.uid()
  const fetchUserProfile = useCallback(
    async (userId: string, authUser?: User | null): Promise<UserRole | null> => {
      const supabase = getSupabase();
      lastProfileErrorRef.current = null;
      try {
        let { data: profData, error: profError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profError) {
          throw new Error(`Gagal memuat profil dari database: ${profError.message}`);
        }

        if (!profData && authUser) {
          await syncPendingMetadataOnLogin(authUser);
          const retry = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          if (retry.error) {
            throw new Error(`Profil gagal dimuat setelah sinkronisasi: ${retry.error.message}`);
          }
          profData = retry.data;
        }

        if (profData) {
          const resolvedRole = profData.role as UserRole;
          setProfile(profData as Profile);
          setRole(resolvedRole);

          if (resolvedRole === 'nurse') {
            setPatientProfile(null);
            setPatientSurgery(null);
            const { data: nData } = await supabase
              .from('nurse_profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            if (nData) {
              setNurseProfile(nData as NurseProfile);
            }
          } else if (resolvedRole === 'patient') {
            setNurseProfile(null);

            if (authUser?.user_metadata?.invitation_token && !inFlightActivationRef.current) {
              const { data: rpcRes, error: rpcErr } = await supabase.rpc(
                'complete_patient_activation',
                { p_token: authUser.user_metadata.invitation_token }
              );
              if (rpcErr) {
                console.warn('complete_patient_activation recovery notice:', rpcErr.message);
              } else if (rpcRes?.success === true) {
                await supabase.auth
                  .updateUser({ data: { invitation_token: null } })
                  .catch(() => undefined);
              }
            }

            const { data: pData } = await supabase
              .from('patient_profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            if (pData) setPatientProfile(pData as PatientProfile);

            const { data: surgData } = await supabase
              .from('patient_surgeries')
              .select('*, surgery_type:surgery_types(*)')
              .eq('patient_id', userId)
              .order('surgery_date', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (surgData) setPatientSurgery(surgData as PatientSurgery);
          }

          return resolvedRole;
        }

        const missingMsg =
          'Akun autentikasi ditemukan, tetapi baris profil belum tersedia di database `profiles`. Pastikan skrip migrasi SQL telah dijalankan.';
        lastProfileErrorRef.current = missingMsg;
        setAuthError(missingMsg);
        return null;
      } catch (err: any) {
        console.error('Error during profile loading:', err);
        const msg = err?.message || 'Gagal memuat data profil pengguna dari Supabase.';
        lastProfileErrorRef.current = msg;
        setAuthError(msg);
        return null;
      }
    },
    [syncPendingMetadataOnLogin]
  );

  // Listen to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;
    const supabase = getSupabase();

    if (
      typeof window !== 'undefined' &&
      (window.location.hash.includes('type=recovery') ||
        new URLSearchParams(window.location.search).get('type') === 'recovery')
    ) {
      setIsPasswordRecovery(true);
    }

    async function initAuth() {
      setIsLoading(true);
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();
        if (error) {
          console.warn('Initial session error:', error.message);
        }
        if (mounted) {
          const recoveryDetected =
            urlHasRecoveryMarker() ||
            isRecoverySession(initialSession) ||
            isPasswordRecoveryRef.current;

          if (recoveryDetected && initialSession?.user) {
            try {
              sessionStorage.setItem(ACTIVE_RECOVERY_UID_KEY, initialSession.user.id);
            } catch {
              // ignore
            }
            setIsPasswordRecovery(true);
            isPasswordRecoveryRef.current = true;
            const metaRole = initialSession.user.user_metadata?.role;
            if (metaRole === 'nurse' || metaRole === 'patient') {
              setRecoveryPortal(metaRole);
            }
          }

          setSession(initialSession);
          setUser(initialSession?.user || null);
          setIsDemoMode(false);
          if (initialSession?.user) {
            handledInitialUserRef.current = initialSession.user.id;
            const resolvedRole = await fetchUserProfile(
              initialSession.user.id,
              recoveryDetected ? null : initialSession.user
            );
            if (mounted && recoveryDetected && (resolvedRole === 'nurse' || resolvedRole === 'patient')) {
              setRecoveryPortal(resolvedRole);
            }
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      const isRecoveryNow =
        event === 'PASSWORD_RECOVERY' ||
        isRecoverySession(newSession) ||
        urlHasRecoveryMarker();

      if (isRecoveryNow) {
        if (newSession?.user?.id) {
          try {
            sessionStorage.setItem(ACTIVE_RECOVERY_UID_KEY, newSession.user.id);
          } catch {
            // ignore
          }
          const metaRole = newSession.user.user_metadata?.role;
          if (metaRole === 'nurse' || metaRole === 'patient') {
            setRecoveryPortal(metaRole);
          }
        }
        setIsPasswordRecovery(true);
        isPasswordRecoveryRef.current = true;
      }

      // Prevent premature unmount of PatientActivation while activatePatient runs or awaits user confirmation click
      if (
        inFlightActivationRef.current ||
        (deferredActivationSessionRef.current &&
          newSession?.user?.id === deferredActivationSessionRef.current.user.id)
      ) {
        return;
      }

      if (
        event === 'INITIAL_SESSION' &&
        newSession?.user?.id &&
        handledInitialUserRef.current === newSession.user.id
      ) {
        handledInitialUserRef.current = null;
        return;
      }

      setSession(newSession);
      setUser(newSession?.user || null);

      if (newSession?.user) {
        setIsDemoMode(false);
        if (event === 'SIGNED_IN' && !isRecoveryNow && !isPasswordRecoveryRef.current) {
          try {
            await syncPendingMetadataOnLogin(newSession.user);
          } catch (syncErr: any) {
            console.warn('Pending metadata sync notice:', syncErr?.message || syncErr);
          }
        }
        const resolvedRole = await fetchUserProfile(
          newSession.user.id,
          isRecoveryNow || isPasswordRecoveryRef.current ? null : newSession.user
        );
        if (
          mounted &&
          (isRecoveryNow || isPasswordRecoveryRef.current) &&
          (resolvedRole === 'nurse' || resolvedRole === 'patient')
        ) {
          setRecoveryPortal(resolvedRole);
        }
      } else {
        handledInitialUserRef.current = null;
        setProfile(null);
        setNurseProfile(null);
        setPatientProfile(null);
        setPatientSurgery(null);
        setRole(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile, syncPendingMetadataOnLogin]);

  // Sign In with email, password, strict portal role enforcement, and session persistence option
  const signIn = async (
    email: string,
    password: string,
    expectedRole?: UserRole,
    rememberMe: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    if (!isSupabaseConfigured()) {
      const msg = 'Konfigurasi Supabase (Anon Key) belum diatur.';
      setAuthError(msg);
      return { success: false, error: msg };
    }

    setRememberSession(rememberMe);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const msg = translateAuthError(error.message);
        setAuthError(msg);
        return { success: false, error: msg };
      }

      if (data?.user) {
        await syncPendingMetadataOnLogin(data.user);
        const actualRole = await fetchUserProfile(data.user.id, data.user);

        if (!actualRole) {
          await supabase.auth.signOut();
          const msg =
            lastProfileErrorRef.current ||
            'Data profil peran Anda belum tersimpan di tabel `profiles` Supabase. Pastikan skrip migrasi SQL telah dijalankan.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (expectedRole && actualRole !== expectedRole) {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
          setNurseProfile(null);
          setPatientProfile(null);
          setPatientSurgery(null);
          setRole(null);
          const msg =
            actualRole === 'nurse'
              ? 'Akun ini terdaftar sebagai Perawat. Silakan masuk melalui Portal Perawat.'
              : 'Akun ini terdaftar sebagai Pasien. Silakan masuk melalui Portal Pasien.';
          setAuthError(msg);
          return { success: false, error: msg };
        }
        setIsDemoMode(false);
      }

      return { success: true };
    } catch (err: any) {
      const msg = translateAuthError(err.message || 'Terjadi kesalahan saat masuk ke sistem.');
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  // Sign Up for Nurses with STR & honest email confirmation + document upload handling
  const signUpNurse = async (data: SignUpNursePayload): Promise<SignUpNurseResult> => {
    setAuthError(null);
    if (!isSupabaseConfigured()) {
      const msg = 'Konfigurasi Supabase (Anon Key) belum diatur.';
      setAuthError(msg);
      return { success: false, error: msg };
    }

    const supabase = getSupabase();
    const normalizedFullName = normalizePersonName(data.fullName);
    const normalizedTitle = normalizedFullName
      ? `${data.hasNersProfession ? 'Ns. ' : ''}${normalizedFullName}, ${data.academicDegree?.trim() || 'S.Kep.'}`
      : data.professionalTitle.trim();

    try {
      const redirectUrl = getAuthCallbackUrl();

      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: normalizedFullName || data.fullName.trim(),
            professional_title: normalizedTitle,
            education_level: data.educationLevel,
            has_ners_profession: data.hasNersProfession,
            academic_degree: data.academicDegree?.trim() || null,
            role: 'nurse',
            str_number: data.strNumber.trim(),
            str_expiry_date: data.strExpiryDate || null,
            department: data.department || 'Rawat Bedah Postoperatif',
            hospital_name: data.hospitalName || 'RS / Klinik Mitra',
            phone: data.phone?.trim() || null,
          },
        },
      });

      if (signUpErr) {
        const msg = translateAuthError(signUpErr.message);
        setAuthError(msg);
        return { success: false, error: msg };
      }

      const newUserId = authData?.user?.id;
      if (!newUserId) {
        const msg = 'Gagal membuat identitas pengguna perawat.';
        setAuthError(msg);
        return { success: false, error: msg };
      }

      // Detect empty identities (Supabase returns fake user with empty identities when email already exists and confirm is enabled)
      if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {
        const msg = 'Alamat email ini sudah terdaftar. Silakan masuk atau gunakan fitur Lupa Password.';
        setAuthError(msg);
        return { success: false, error: msg };
      }

      const hasActiveSession = Boolean(authData.session);
      let strUrl: string | null = null;
      let diplomaUrl: string | null = null;
      let documentNotice: string | undefined;

      if (hasActiveSession) {
        // Upload documents to Supabase Storage if files selected and bucket available
        if (data.strFile || data.diplomaFile) {
          try {
            if (data.strFile) {
              const path = `${newUserId}/str_${Date.now()}_${data.strFile.name}`;
              const { error: upErr } = await supabase.storage
                .from('nurse-documents')
                .upload(path, data.strFile, { upsert: true });
              if (!upErr) strUrl = path;
              else documentNotice = 'Berkas dicatat secara lokal, namun bucket Storage `nurse-documents` belum tersedia di Supabase.';
            }
            if (data.diplomaFile) {
              const path = `${newUserId}/diploma_${Date.now()}_${data.diplomaFile.name}`;
              const { error: upErr } = await supabase.storage
                .from('nurse-documents')
                .upload(path, data.diplomaFile, { upsert: true });
              if (!upErr) diplomaUrl = path;
            }
          } catch {
            documentNotice = 'Unggah dokumen ke cloud storage memerlukan konfigurasi bucket `nurse-documents`.';
          }
        }

        const { error: profErr } = await supabase.from('profiles').upsert({
          id: newUserId,
          email: data.email.trim(),
          full_name: normalizedFullName || data.fullName.trim(),
          role: 'nurse',
          phone: data.phone?.trim() || null,
        });
        if (profErr) {
          const msg = `Akun autentikasi terbuat, namun gagal menyimpan profil dasar: ${profErr.message}`;
          setAuthError(msg);
          return { success: false, error: msg };
        }

        const { error: nurseErr } = await supabase.from('nurse_profiles').upsert({
          id: newUserId,
          str_number: data.strNumber.trim(),
          str_expiry_date: data.strExpiryDate || null,
          verification_status: 'pending',
          education_level: data.educationLevel,
          has_ners_profession: data.hasNersProfession,
          academic_degree: data.academicDegree?.trim() || null,
          professional_title: normalizedTitle,
          department: data.department || 'Rawat Bedah Postoperatif',
          hospital_name: data.hospitalName || 'RS / Klinik Mitra',
          str_document_url: strUrl,
          diploma_document_url: diplomaUrl,
        });
        if (nurseErr) {
          const msg = `Profil dasar tersimpan, namun gagal menyimpan kredensial perawat: ${nurseErr.message}`;
          setAuthError(msg);
          return { success: false, error: msg };
        }

        await fetchUserProfile(newUserId, authData.user);
      } else if (data.strFile || data.diplomaFile) {
        documentNotice = 'Berkas STR/Ijazah dapat diunggah ke cloud setelah Anda memverifikasi email dan masuk ke profil perawat.';
      }

      return {
        success: true,
        requiresEmailConfirmation: !hasActiveSession,
        documentNotice,
      };
    } catch (err: any) {
      const msg = translateAuthError(err.message || 'Gagal mendaftarkan akun perawat.');
      setAuthError(msg);
      return { success: false, error: msg };
    }
  };

  // Patient account activation via nurse invitation token
  const activatePatient = async (data: {
    email: string;
    password: string;
    fullName: string;
    token: string;
  }): Promise<ActivatePatientResult> => {
    setAuthError(null);
    if (!isSupabaseConfigured()) {
      const msg = 'Konfigurasi Supabase (Anon Key) belum diatur.';
      setAuthError(msg);
      return { success: false, error: msg };
    }

    const supabase = getSupabase();
    const cleanToken = data.token.trim().toUpperCase();
    const cleanEmail = data.email.trim().toLowerCase();
    const normalizedName = normalizePersonName(data.fullName) || cleanEmail.split('@')[0];

    inFlightActivationRef.current = true;
    try {
      // 1. Validate invitation token strictly via SECURITY DEFINER RPC (zero anon table bypass)
      const { data: rpcVerify, error: rpcVerifyErr } = await supabase.rpc(
        'verify_patient_invitation',
        {
          p_token: cleanToken,
          p_email: cleanEmail,
        }
      );

      if (rpcVerifyErr) {
        const msg = isMissingRpcError(rpcVerifyErr)
          ? 'Fungsi verifikasi undangan (`verify_patient_invitation`) belum terpasang di Supabase. Pastikan migrasi SQL backend sudah dijalankan.'
          : `Gagal memvalidasi token undangan: ${rpcVerifyErr.message}`;
        setAuthError(msg);
        return { success: false, error: msg };
      }

      if (!rpcVerify || !rpcVerify.valid) {
        const msg = rpcVerify?.reason || 'Token undangan tidak valid atau kedaluwarsa.';
        setAuthError(msg);
        return { success: false, error: msg };
      }

      // 2. Register user in Supabase Auth (or reuse existing matching session if retrying an incomplete activation)
      let activeUser: User | null = null;
      let activeSession: Session | null = null;

      const { data: existingSessData } = await supabase.auth.getSession();
      const existingSession = existingSessData?.session;
      if (
        existingSession?.user &&
        existingSession.user.email?.toLowerCase() === cleanEmail &&
        existingSession.user.user_metadata?.role !== 'nurse'
      ) {
        activeUser = existingSession.user;
        activeSession = existingSession;
      } else {
        const redirectUrl = getAuthCallbackUrl();
        const { data: authData, error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password: data.password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: normalizedName,
              role: 'patient',
              invitation_token: cleanToken,
            },
          },
        });

        if (signUpErr) {
          const msg = translateAuthError(signUpErr.message);
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (!authData?.user?.id) {
          const msg = 'Gagal membuat identitas pasien.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (Array.isArray(authData.user?.identities) && authData.user.identities.length === 0) {
          const msg = 'Email ini sudah terdaftar sebagai akun. Silakan masuk di Portal Pasien.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        activeUser = authData.user;
        activeSession = authData.session || null;
      }

      const patientUserId = activeUser.id;
      const hasActiveSession = Boolean(activeSession);

      if (hasActiveSession && activeSession) {
        const { error: profErr } = await supabase.from('profiles').upsert({
          id: patientUserId,
          email: cleanEmail,
          full_name: normalizedName,
          role: 'patient',
        });
        if (profErr) {
          const msg = `Akun terbuat, namun gagal menyimpan profil pasien: ${profErr.message}`;
          setAuthError(msg);
          return { success: false, error: msg };
        }

        const { data: actData, error: actRpcErr } = await supabase.rpc('complete_patient_activation', {
          p_token: cleanToken,
        });

        if (actRpcErr) {
          const msg = isMissingRpcError(actRpcErr)
            ? 'Akun autentikasi terbuat, tetapi fungsi `complete_patient_activation` belum terpasang di Supabase. Jalankan migrasi SQL 004 lalu masuk kembali.'
            : `Akun terbuat, namun aktivasi undangan gagal diselesaikan: ${actRpcErr.message}`;
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (actData && actData.success === false) {
          const msg = actData.reason || 'Aktivasi undangan pasien gagal diselesaikan.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        await supabase.auth.updateUser({ data: { invitation_token: null } }).catch(() => undefined);
        // Hold portal entry until user clicks "Masuk ke NurseGo" on activation confirmation screen
        deferredActivationSessionRef.current = {
          user: activeUser,
          session: activeSession,
        };
      }

      return {
        success: true,
        requiresEmailConfirmation: !hasActiveSession,
      };
    } catch (err: any) {
      const msg = translateAuthError(err.message || 'Gagal mengaktifkan akun pasien.');
      setAuthError(msg);
      return { success: false, error: msg };
    } finally {
      inFlightActivationRef.current = false;
    }
  };

  const commitPendingActivationSession = useCallback(async () => {
    const pending = deferredActivationSessionRef.current;
    deferredActivationSessionRef.current = null;
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

    const supabase = getSupabase();
    const targetSession = pending?.session || (await supabase.auth.getSession()).data.session;
    const targetUser = pending?.user || targetSession?.user || null;

    setSession(targetSession || null);
    setUser(targetUser);
    setIsDemoMode(false);
    if (targetUser) {
      await fetchUserProfile(targetUser.id, targetUser);
    }
  }, [fetchUserProfile]);

  // Real Supabase Password Reset Email
  const resetPassword = async (
    email: string,
    portal?: UserRole
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Konfigurasi Supabase belum diatur.' };
    }
    if (portal) {
      saveRecoveryPortalHint(portal);
      setRecoveryPortal(portal);
    }
    const supabase = getSupabase();
    try {
      const redirectTo = getAuthCallbackUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) {
        return { success: false, error: translateAuthError(error.message) };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: translateAuthError(err.message || 'Gagal mengirim email pemulihan.') };
    }
  };

  // Real Supabase Update Password (after PASSWORD_RECOVERY or from Profile)
  const updatePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (isDemoMode) {
      return { success: false, error: 'Tidak dapat mengubah kata sandi pada mode demo.' };
    }
    const supabase = getSupabase();
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: translateAuthError(error.message) };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: translateAuthError(err.message || 'Gagal memperbarui kata sandi.') };
    }
  };

  // Complete or cancel password recovery by signing out the temporary recovery session and returning the target portal
  const finishPasswordRecovery = useCallback(async (): Promise<UserRole | null> => {
    const resolvedTarget: UserRole | null =
      role ||
      (user?.user_metadata?.role === 'nurse' || user?.user_metadata?.role === 'patient'
        ? (user.user_metadata.role as UserRole)
        : null) ||
      recoveryPortal ||
      readRecoveryPortalHint();

    const supabase = getSupabase();
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Finish password recovery signOut notice:', err);
    } finally {
      clearPasswordRecovery();
      deferredActivationSessionRef.current = null;
      setUser(null);
      setSession(null);
      setProfile(null);
      setNurseProfile(null);
      setPatientProfile(null);
      setPatientSurgery(null);
      setRole(null);
      setIsDemoMode(false);
      setAuthError(null);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/');
      }
    }
    return resolvedTarget;
  }, [role, user, recoveryPortal, clearPasswordRecovery]);

  // Real Resend Verification Email
  const resendVerificationEmail = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Konfigurasi Supabase belum diatur.' };
    }
    const supabase = getSupabase();
    try {
      const redirectTo = getAuthCallbackUrl();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        return { success: false, error: translateAuthError(error.message) };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: translateAuthError(err.message || 'Gagal mengirim ulang email verifikasi.') };
    }
  };

  const signOut = async () => {
    const supabase = getSupabase();
    try {
      if (!isDemoMode) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Sign out warning:', err);
    } finally {
      deferredActivationSessionRef.current = null;
      setUser(null);
      setSession(null);
      setProfile(null);
      setNurseProfile(null);
      setPatientProfile(null);
      setPatientSurgery(null);
      setRole(null);
      setIsDemoMode(false);
      setAuthError(null);
    }
  };

  const loginAsDemo = (demoRole: 'nurse' | 'patient') => {
    setAuthError(null);
    setIsDemoMode(true);
    if (demoRole === 'nurse') {
      const demoUser = {
        id: DEMO_NURSE.id,
        email: DEMO_NURSE.email,
        app_metadata: {},
        user_metadata: { role: 'nurse', full_name: DEMO_NURSE.full_name },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as unknown as User;
      setUser(demoUser);
      setProfile(DEMO_NURSE);
      setNurseProfile(DEMO_NURSE.nurse_profile);
      setRole('nurse');
      setPatientProfile(null);
      setPatientSurgery(null);
    } else {
      const demoPat = DEMO_PATIENTS[0];
      const demoUser = {
        id: demoPat.profile.id,
        email: demoPat.profile.email,
        app_metadata: {},
        user_metadata: { role: 'patient', full_name: demoPat.profile.full_name },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as unknown as User;
      setUser(demoUser);
      setProfile(demoPat.profile);
      setPatientProfile(demoPat.patient_profile);
      setPatientSurgery(demoPat.surgery);
      setRole('patient');
      setNurseProfile(null);
    }
  };

  const refreshProfile = useCallback(async () => {
    if (isDemoMode) return;
    const supabase = getSupabase();
    const activeUser = user || (await supabase.auth.getUser()).data.user;
    if (activeUser) {
      await fetchUserProfile(activeUser.id, activeUser);
    }
  }, [user, isDemoMode, fetchUserProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        nurseProfile,
        patientProfile,
        patientSurgery,
        role,
        isDemoMode,
        isLoading,
        isConfigured: isConfiguredState,
        isPasswordRecovery,
        recoveryPortal,
        authError,
        setAuthError,
        clearPasswordRecovery,
        finishPasswordRecovery,
        signIn,
        signUpNurse,
        activatePatient,
        resetPassword,
        updatePassword,
        resendVerificationEmail,
        loginAsDemo,
        signOut,
        refreshProfile,
        commitPendingActivationSession,
        recheckConfiguration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
