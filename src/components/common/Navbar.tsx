/**
 * Navigation Bar for NurseGo
 * 
 * Features:
 * - Desktop Top Bar & Mobile Bottom Navigation Bar
 * - Notification Bell with unread counter
 * - Supabase Status Indicator
 * - User Profile & Quick Logout
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';
import {
  Activity,
  Users,
  AlertTriangle,
  FileText,
  User,
  HeartPulse,
  Pill,
  ClipboardList,
  LogOut,
  Bell
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenNotifications: () => void;
  unreadCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenNotifications,
  unreadCount = 0,
}) => {
  const { user, profile, nurseProfile, role, isDemoMode, signOut } = useAuth();

  // Navigation tabs for Nurse: 1. Beranda, 2. Pasien, 3. Peringatan, 4. Dokumentasi, 5. Profil
  const nurseTabs = [
    { id: 'beranda', label: 'Beranda', icon: Activity },
    { id: 'pasien', label: 'Pasien', icon: Users },
    { id: 'peringatan', label: 'Peringatan', icon: AlertTriangle },
    { id: 'dokumentasi', label: 'Dokumentasi', icon: FileText },
    { id: 'profil', label: 'Profil Perawat', icon: User },
  ];

  // Navigation tabs for Patient: 1. Beranda, 2. Perawatan, 3. Pantau, 4. Riwayat, 5. Profil
  const patientTabs = [
    { id: 'beranda', label: 'Beranda', icon: Activity },
    { id: 'perawatan', label: 'Perawatan', icon: Pill },
    { id: 'pantau', label: 'Pantau Harian', icon: HeartPulse },
    { id: 'riwayat', label: 'Riwayat', icon: ClipboardList },
    { id: 'profil', label: 'Profil Saya', icon: User },
  ];

  const activeTabs = role === 'nurse' ? nurseTabs : patientTabs;

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 sm:gap-4 h-16">
            {/* Zone 1: Brand wordmark */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs">
                <HeartPulse className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                  NurseGo
                </span>
                <span className="text-[10px] text-teal-700 font-semibold tracking-wide uppercase -mt-0.5">
                  {role === 'nurse' ? 'Portal Perawat' : 'Portal Pasien'}
                  {isDemoMode ? ' · Demo' : ''}
                </span>
              </div>
            </div>

            {/* Zone 2: Navigation Links (Desktop) */}
            {user && (
              <nav className="hidden md:flex items-center gap-1 sm:gap-2">
                {activeTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onSelectTab(tab.id)}
                      className={`px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-teal-50 text-teal-800 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Zone 3: Actions & Notifications */}
            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton compact />

              {/* Notification Bell */}
              {user && (
                <button
                  type="button"
                  onClick={onOpenNotifications}
                  title="Lihat Pemberitahuan"
                  className="p-2 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors relative"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
                  )}
                </button>
              )}

              {user ? (
                <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                  <div className="hidden lg:flex flex-col text-right">
                    <span className="text-xs font-semibold text-slate-800 truncate max-w-[150px]">
                      {nurseProfile?.professional_title || profile?.full_name || user.email?.split('@')[0]}
                    </span>
                    <span className="text-[10px] text-slate-500 capitalize">
                      {role === 'nurse' ? 'Perawat Terdaftar' : 'Pasien'}
                    </span>
                  </div>
                  <button
                    onClick={() => signOut()}
                    title="Keluar dari akun"
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-2 py-1 shadow-lg">
          <div className="flex items-center justify-around">
            {activeTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] text-[10px] font-medium transition-colors ${
                    isActive ? 'text-teal-700 font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                  <span className="truncate max-w-[60px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
};
