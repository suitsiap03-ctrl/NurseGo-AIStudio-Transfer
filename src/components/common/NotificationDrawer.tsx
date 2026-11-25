/**
 * Notification Drawer for NurseGo (Nurse & Patient)
 * 
 * Features:
 * - Unread count badges
 * - Category icons & color tags
 * - Quick action to navigate or view details
 * - Mark as read / Mark all as read
 */

import React from 'react';
import { NotificationItem, UserRole } from '../../types/database';
import {
  X,
  Bell,
  AlertTriangle,
  HeartPulse,
  Pill,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  role: UserRole;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onSelectTarget?: (targetId: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  role,
  onMarkAsRead,
  onMarkAllAsRead,
  onSelectTarget,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pemberitahuan</h2>
              <p className="text-[11px] text-slate-500">
                {role === 'nurse' ? 'Aktivitas pemantauan & peringatan pasien' : 'Pengingat obat & perawatan harian'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="text-[11px] text-teal-700 hover:text-teal-900 font-medium px-2 py-1 rounded"
              >
                Tandai semua dibaca
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
          {notifications.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-medium text-slate-700">Tidak ada pemberitahuan</p>
              <p className="text-[11px] text-slate-400">Seluruh jadwal dan pemantauan telah diperbarui.</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isAlert = notif.type === 'alert';
              const isMed = notif.type === 'medication';
              const isAppt = notif.type === 'appointment';
              const isMonitoring = notif.type === 'monitoring';
              const isSystem = notif.type === 'system';

              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    onMarkAsRead(notif.id);
                    if (notif.link_target && onSelectTarget) {
                      onSelectTarget(notif.link_target);
                      onClose();
                    }
                  }}
                  className={`p-4 transition-colors cursor-pointer hover:bg-slate-50 flex items-start gap-3 ${
                    !notif.is_read ? 'bg-teal-50/40' : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                      isAlert
                        ? 'bg-rose-100 text-rose-700'
                        : isMed
                        ? 'bg-amber-100 text-amber-700'
                        : isAppt
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-teal-100 text-teal-700'
                    }`}
                  >
                    {isAlert && <AlertTriangle className="w-4 h-4" />}
                    {isMed && <Pill className="w-4 h-4" />}
                    {isAppt && <Calendar className="w-4 h-4" />}
                    {(isMonitoring || isSystem) && <HeartPulse className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4
                        className={`text-xs ${
                          !notif.is_read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {new Date(notif.created_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-slate-600 text-[11px] leading-relaxed">{notif.message}</p>

                    {notif.link_target && (
                      <span className="text-[11px] font-semibold text-teal-700 inline-flex items-center gap-1 pt-0.5">
                        <span>{role === 'nurse' ? 'Buka data pasien' : 'Lihat detail perawatan'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 text-center text-[11px] text-slate-400">
          NurseGo Notification System · Terintegrasi Real-time
        </div>
      </div>
    </div>
  );
};
