/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/common/Navbar';
import { WelcomeScreen } from './components/common/WelcomeScreen';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { OfflineIndicator } from './components/common/OfflineIndicator';

// Auth Components
import { NurseLogin } from './components/auth/NurseLogin';
import { NurseRegister } from './components/auth/NurseRegister';
import { PatientLogin } from './components/auth/PatientLogin';
import { PatientActivation } from './components/auth/PatientActivation';
import { PasswordRecoveryModal } from './components/auth/PasswordRecoveryModal';
import { AuthCallback } from './components/auth/AuthCallback';

// Nurse Components
import { NurseDashboard } from './components/nurse/NurseDashboard';
import { PatientList } from './components/nurse/PatientList';
import { PatientDetail } from './components/nurse/PatientDetail';
import { NurseAlerts } from './components/nurse/NurseAlerts';
import { NurseDocumentation } from './components/nurse/NurseDocumentation';
import { NurseProfileView } from './components/nurse/NurseProfileView';
import { AddPatientModal } from './components/nurse/AddPatientModal';

// Patient Components
import { PatientDashboard } from './components/patient/PatientDashboard';
import { PatientCare } from './components/patient/PatientCare';
import { PatientMonitoringForm } from './components/patient/PatientMonitoringForm';
import { PatientHistory } from './components/patient/PatientHistory';
import { PatientProfileView } from './components/patient/PatientProfileView';

import { NotificationItem } from './types/database';
import { DEMO_NOTIFICATIONS_NURSE, DEMO_NOTIFICATIONS_PATIENT } from './data/mockData';
import { getSupabase } from './lib/supabaseClient';
import { AUTH_CALLBACK_PATH } from './lib/appUrl';
import { parseLinkTarget } from './lib/notifications';
import { useRealtimeSubscription } from './hooks/useRealtimeSubscription';
import { HeartPulse, Sparkles, LogOut, AlertCircle, X, KeyRound } from 'lucide-react';

type AuthView = 'welcome' | 'nurse_login' | 'nurse_register' | 'patient_login' | 'patient_activation';

function getActivationParamsFromUrl(): { hasActivation: boolean; token: string } {
  if (typeof window === 'undefined') return { hasActivation: false, token: '' };
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();
  const view = params.get('view');
  return {
    hasActivation: Boolean(view === 'activate' || token),
    token,
  };
}

function detectAuthCallbackRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === AUTH_CALLBACK_PATH) return true;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return Boolean(
    searchParams.get('code') ||
      searchParams.get('token_hash') ||
      searchParams.get('error') ||
      searchParams.get('error_description') ||
      hashParams.get('access_token') ||
      hashParams.get('error') ||
      hashParams.get('error_description')
  );
}

const MainAppContent: React.FC = () => {
  const {
    user,
    role,
    isDemoMode,
    isLoading,
    isPasswordRecovery,
    authError,
    setAuthError,
    loginAsDemo,
    signOut,
  } = useAuth();
  const [loginSuccessNotice, setLoginSuccessNotice] = useState<string | null>(null);

  const [isAuthCallback, setIsAuthCallback] = useState<boolean>(() => detectAuthCallbackRoute());

  const [authView, setAuthView] = useState<AuthView>(() => {
    return getActivationParamsFromUrl().hasActivation ? 'patient_activation' : 'welcome';
  });
  const [activationBannerToken, setActivationBannerToken] = useState<string | null>(() => {
    const info = getActivationParamsFromUrl();
    return info.hasActivation ? info.token || 'UNDANGAN' : null;
  });

  const handleCompleteAuthCallback = useCallback(
    (target?: 'portal' | 'recovery' | 'welcome' | 'nurse_login' | 'patient_login') => {
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/');
      }
      setIsAuthCallback(false);
      if (target && target !== 'portal' && target !== 'recovery') {
        setAuthView(target);
      }
    },
    []
  );

  const [currentTab, setCurrentTab] = useState<string>('beranda');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPatientSubtab, setSelectedPatientSubtab] = useState<string | undefined>(undefined);
  const [selectedCareSubtab, setSelectedCareSubtab] = useState<string | undefined>(undefined);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  const [isAddPatientOpen, setIsAddPatientOpen] = useState<boolean>(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Reset portal selection when role or user changes
  useEffect(() => {
    setCurrentTab('beranda');
    setSelectedPatientId(null);
    setSelectedPatientSubtab(undefined);
    setSelectedCareSubtab(undefined);
  }, [user?.id, role]);

  const loadNotifications = useCallback(async () => {
    if (!user || !role) {
      setNotifications([]);
      return;
    }

    if (isDemoMode) {
      setNotifications(role === 'nurse' ? DEMO_NOTIFICATIONS_NURSE : DEMO_NOTIFICATIONS_PATIENT);
      return;
    }

    const supabase = getSupabase();
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setNotifications(data as NotificationItem[]);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
      setNotifications([]);
    }
  }, [user, role, isDemoMode]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleNotificationsRealtime = useCallback(() => {
    loadNotifications();
    setRefreshNonce((prev) => prev + 1);
  }, [loadNotifications]);

  useRealtimeSubscription(
    `notifications-${user?.id || 'anon'}`,
    user && !isDemoMode ? [{ table: 'notifications', filter: `user_id=eq.${user.id}` }] : [],
    handleNotificationsRealtime,
    Boolean(user && !isDemoMode)
  );

  const handleMarkAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    if (!isDemoMode && user) {
      const supabase = getSupabase();
      await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id);
    }
  };

  const handleMarkAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (!isDemoMode && user) {
      const supabase = getSupabase();
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
    }
  };

  const handleSelectNotificationTarget = (targetRaw: string) => {
    setIsNotificationOpen(false);
    const parsed = parseLinkTarget(targetRaw);

    if (role === 'nurse') {
      if (parsed.kind === 'patient' && parsed.patientId) {
        setSelectedPatientId(parsed.patientId);
        setSelectedPatientSubtab(parsed.subtab);
        setCurrentTab('pasien');
      } else if (parsed.kind === 'tab' && parsed.tab) {
        if (parsed.tab === 'patients' || parsed.tab.startsWith('patients:')) {
          setSelectedPatientId(null);
          setSelectedPatientSubtab(undefined);
          setCurrentTab('pasien');
        } else {
          setCurrentTab(parsed.tab);
        }
      } else {
        setSelectedPatientId(null);
        setCurrentTab('pasien');
      }
    } else {
      if (parsed.kind === 'tab' && parsed.tab) {
        setCurrentTab(parsed.tab);
        if (parsed.tab === 'perawatan') {
          setSelectedCareSubtab(parsed.subtab);
        }
      } else {
        setCurrentTab('perawatan');
      }
    }
  };

  const handleSelectPatient = (pId: string) => {
    setSelectedPatientId(pId);
    setSelectedPatientSubtab(undefined);
    setCurrentTab('pasien');
  };

  const handleTabChange = (tabSpec: string) => {
    const [tab, subtab] = tabSpec.split(':');
    setCurrentTab(tab);
    if (tab !== 'pasien') {
      setSelectedPatientId(null);
      setSelectedPatientSubtab(undefined);
    }
    if (tab === 'perawatan') {
      setSelectedCareSubtab(subtab);
    } else {
      setSelectedCareSubtab(undefined);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white mb-4 animate-pulse">
          <HeartPulse className="w-7 h-7" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Menghubungkan ke NurseGo...</p>
        <p className="text-xs text-slate-400 mt-1">Memeriksa sesi autentikasi Supabase</p>
      </div>
    );
  }

  if (isAuthCallback) {
    return (
      <>
        <AuthCallback onComplete={handleCompleteAuthCallback} />
        <OfflineIndicator />
      </>
    );
  }

  // CRITICAL: Handle password recovery in isolation BEFORE any role-based dashboard routing
  if (isPasswordRecovery) {
    return (
      <>
        <PasswordRecoveryModal
          onRedirectToLogin={(targetPortal, successMessage) => {
            if (successMessage) {
              setLoginSuccessNotice(successMessage);
            }
            if (targetPortal === 'nurse') {
              setAuthView('nurse_login');
            } else if (targetPortal === 'patient') {
              setAuthView('patient_login');
            } else {
              setAuthView('welcome');
            }
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {authView === 'welcome' && (
          <WelcomeScreen
            onSelectRole={(selectedRole) => {
              if (selectedRole === 'nurse') {
                setAuthView('nurse_login');
              } else {
                setAuthView('patient_login');
              }
            }}
            onSelectDemo={(demoRole) => {
              loginAsDemo(demoRole);
            }}
          />
        )}

        {authView === 'nurse_login' && (
          <NurseLogin
            onBackToPortalSelector={() => {
              setLoginSuccessNotice(null);
              setAuthView('welcome');
            }}
            onGoToRegister={() => {
              setLoginSuccessNotice(null);
              setAuthView('nurse_register');
            }}
            onSelectDemo={() => loginAsDemo('nurse')}
            externalSuccessMsg={loginSuccessNotice}
            onDismissExternalSuccess={() => setLoginSuccessNotice(null)}
          />
        )}

        {authView === 'nurse_register' && (
          <NurseRegister onBackToLogin={() => setAuthView('nurse_login')} />
        )}

        {authView === 'patient_login' && (
          <PatientLogin
            onBackToPortalSelector={() => {
              setLoginSuccessNotice(null);
              setAuthView('welcome');
            }}
            onGoToActivation={() => {
              setLoginSuccessNotice(null);
              setAuthView('patient_activation');
            }}
            onSelectDemo={() => loginAsDemo('patient')}
            externalSuccessMsg={loginSuccessNotice}
            onDismissExternalSuccess={() => setLoginSuccessNotice(null)}
          />
        )}

        {authView === 'patient_activation' && (
          <PatientActivation
            onBackToLogin={() => setAuthView('patient_login')}
            onActivationSuccess={() => setAuthView('patient_login')}
          />
        )}

        <OfflineIndicator />
      </div>
    );
  }

  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        currentTab={currentTab}
        onSelectTab={handleTabChange}
        onOpenNotifications={() => setIsNotificationOpen(true)}
        unreadCount={unreadNotifsCount}
      />

      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Mode Pratinjau Demo Offline:</strong> Data tidak disimpan ke database
                Supabase. Masuk dengan akun terdaftar untuk sinkronisasi nyata antara perawat dan
                pasien.
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="self-start sm:self-center px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Mode Demo</span>
            </button>
          </div>
        </div>
      )}

      {activationBannerToken && getActivationParamsFromUrl().hasActivation && (
        <div className="bg-teal-50 border-b border-teal-200 px-4 py-2.5 text-xs text-teal-950">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-700 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                Tautan aktivasi akun pasien (<strong>{activationBannerToken}</strong>) terdeteksi,
                namun Anda masih masuk sebagai <strong>{user.email}</strong>. Keluar terlebih dahulu
                untuk mengaktifkan akun pasien baru.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  setActivationBannerToken(null);
                  await signOut();
                  setAuthView('patient_activation');
                }}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold"
              >
                Keluar &amp; Buka Aktivasi
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivationBannerToken(null);
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
                }}
                className="px-2.5 py-1.5 text-teal-800 hover:bg-teal-100 rounded-lg font-medium"
              >
                Abaikan
              </button>
            </div>
          </div>
        </div>
      )}

      {authError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-900">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{authError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="p-1 text-rose-600 hover:bg-rose-100 rounded"
              aria-label="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8">
        {/* NURSE VIEWS */}
        {role === 'nurse' && (
          <>
            {currentTab === 'beranda' && (
              <NurseDashboard
                onSelectPatient={handleSelectPatient}
                onNavigateTab={handleTabChange}
                onOpenAddPatient={() => setIsAddPatientOpen(true)}
                refreshTrigger={refreshNonce}
              />
            )}

            {currentTab === 'pasien' &&
              (selectedPatientId ? (
                <PatientDetail
                  patientId={selectedPatientId}
                  initialTab={selectedPatientSubtab}
                  onBack={() => {
                    setSelectedPatientId(null);
                    setSelectedPatientSubtab(undefined);
                    setRefreshNonce((prev) => prev + 1);
                  }}
                />
              ) : (
                <PatientList
                  onSelectPatient={handleSelectPatient}
                  onOpenAddPatient={() => setIsAddPatientOpen(true)}
                  refreshTrigger={refreshNonce}
                />
              ))}

            {currentTab === 'peringatan' && (
              <NurseAlerts onSelectPatient={handleSelectPatient} />
            )}

            {currentTab === 'dokumentasi' && (
              <NurseDocumentation onSelectPatient={handleSelectPatient} />
            )}

            {currentTab === 'profil' && <NurseProfileView />}
          </>
        )}

        {/* PATIENT VIEWS */}
        {role === 'patient' && (
          <>
            {currentTab === 'beranda' && <PatientDashboard onNavigateTab={handleTabChange} />}

            {currentTab === 'perawatan' && <PatientCare initialSubTab={selectedCareSubtab} />}

            {currentTab === 'pantau' && (
              <PatientMonitoringForm
                onSuccess={() => {
                  setRefreshNonce((prev) => prev + 1);
                  handleTabChange('beranda');
                }}
              />
            )}

            {currentTab === 'riwayat' && <PatientHistory />}

            {currentTab === 'profil' && <PatientProfileView />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 bg-white border-t border-slate-200 text-center text-[11px] text-slate-500 px-4">
        <p className="max-w-2xl mx-auto leading-relaxed">
          <strong>NurseGo</strong> – Sistem Informasi Pemantauan Pascaoperasi di Rumah. Bantuan
          pemantauan klinis berbasis web, bukan pengganti pemeriksaan langsung tenaga medis.
        </p>
      </footer>

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        role={role || 'patient'}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onSelectTarget={handleSelectNotificationTarget}
      />

      {/* Add Patient Modal (Nurse only) */}
      <AddPatientModal
        isOpen={isAddPatientOpen}
        onClose={() => setIsAddPatientOpen(false)}
        onPatientAdded={() => {
          setRefreshNonce((prev) => prev + 1);
        }}
      />

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
