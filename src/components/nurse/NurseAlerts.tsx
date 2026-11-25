/**
 * Nurse Alerts Center for NurseGo
 *
 * - 3-level alert triage: Waspada, Urgent, Darurat
 * - Realtime subscription to `patient_alerts`
 * - Sends persistent notification to patient when nurse updates alert status
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { createNotification } from '../../lib/notifications';
import { fetchNurseRelationships } from '../../lib/nurseRelationships';
import { DEMO_ALERTS, DEMO_PATIENTS } from '../../data/mockData';
import { CheckCircle2, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';

interface NurseAlertsProps {
  onSelectPatient: (patientId: string) => void;
}

export const NurseAlerts: React.FC<NurseAlertsProps> = ({ onSelectPatient }) => {
  const { user, isDemoMode } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('aktif');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState<string>('');
  const [updatingAlertId, setUpdatingAlertId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setAlerts(
        DEMO_ALERTS.map((a) => ({
          ...a,
          patient: DEMO_PATIENTS.find((dp) => dp.profile.id === a.patient_id)?.profile,
        }))
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    const supabase = getSupabase();

    try {
      const relResult = await fetchNurseRelationships(supabase, user.id);
      if (relResult.error) throw new Error(relResult.error);

      const assignments = relResult.active;
      if (assignments.length > 0) {
        const patientIds = assignments.map((a) => a.patient_id);

        const [{ data: alertList, error: alErr }, { data: profiles, error: profErr }] = await Promise.all([
          supabase
            .from('patient_alerts')
            .select('*')
            .in('patient_id', patientIds)
            .order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, full_name, email').in('id', patientIds),
        ]);

        if (alErr) throw alErr;
        if (profErr) {
          setErrorMsg(`Sebagian data profil pasien gagal dimuat: ${profErr.message}`);
        }

        const merged = (alertList || []).map((a: any) => ({
          ...a,
          patient: profiles?.find((p: any) => p.id === a.patient_id),
        }));

        setAlerts(merged);
      } else {
        setAlerts([]);
      }
    } catch (err: any) {
      setErrorMsg(`Gagal memuat peringatan: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useRealtimeSubscription(
    `nurse-alerts-${user?.id || 'anon'}`,
    [
      { table: 'patient_alerts' },
      { table: 'patient_nurse_assignments', filter: user ? `nurse_id=eq.${user.id}` : undefined },
    ],
    fetchAlerts,
    Boolean(user && !isDemoMode)
  );

  const handleUpdateStatus = async (
    alert: any,
    newStatus: 'ditinjau' | 'selesai'
  ) => {
    if (!user || isDemoMode || updatingAlertId) return;
    setUpdatingAlertId(alert.id);
    setErrorMsg(null);
    const supabase = getSupabase();
    const notes =
      resolutionText.trim() ||
      `Ditangani oleh perawat pada ${new Date().toLocaleString('id-ID')}`;

    try {
      const { error } = await supabase
        .from('patient_alerts')
        .update({
          status: newStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: notes,
        })
        .eq('id', alert.id);

      if (error) {
        setErrorMsg(`Gagal memperbarui status peringatan: ${error.message}`);
        return;
      }

      await supabase
        .from('patient_alert_events')
        .insert({
          alert_id: alert.id,
          event_type: newStatus === 'selesai' ? 'alert_resolved' : 'alert_reviewed',
          notes,
          created_by: user.id,
        })
        .then(({ error: evtErr }) => {
          if (evtErr) console.warn('Alert event log notice:', evtErr.message);
        });

      await createNotification({
        userId: alert.patient_id,
        role: 'patient',
        title: `Tindak Lanjut Perawat: ${alert.title}`,
        message: notes,
        type: 'alert',
        linkTarget: 'tab:beranda',
      });

      setResolvingId(null);
      setResolutionText('');
      fetchAlerts();
    } finally {
      setUpdatingAlertId(null);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    const matchLevel = levelFilter === 'all' || a.alert_level === levelFilter;
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchLevel && matchStatus;
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Pusat Peringatan & Triage Klinis
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Mendeteksi dini perubahan parameter tanda vital, nyeri, luka, dan kondisi umum pasien pascaoperasi.
          </p>
        </div>

        <button
          onClick={() => fetchAlerts()}
          className="self-start sm:self-center p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="Muat ulang data peringatan"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Tingkat Keparahan:</span>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
          >
            <option value="all">Semua Tingkat</option>
            <option value="darurat">Darurat</option>
            <option value="urgent">Urgent</option>
            <option value="waspada">Waspada</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Status Penanganan:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
          >
            <option value="all">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="ditinjau">Ditinjau</option>
            <option value="selesai">Selesai</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600 mb-2" />
            <span>Memuat data peringatan...</span>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-medium text-slate-700">Tidak ada peringatan yang sesuai dengan filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAlerts.map((al) => {
              const isDarurat = al.alert_level === 'darurat';
              const isUrgent = al.alert_level === 'urgent';
              const isResolving = resolvingId === al.id;

              return (
                <div key={al.id} className="p-5 space-y-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isDarurat
                            ? 'bg-rose-100 text-rose-800'
                            : isUrgent
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {al.alert_level}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900">{al.title}</h3>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{new Date(al.created_at).toLocaleString('id-ID')}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          al.status === 'aktif'
                            ? 'bg-rose-50 text-rose-700'
                            : al.status === 'ditinjau'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {al.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2 text-xs">
                    <span className="text-slate-500">Pasien:</span>
                    <strong className="text-slate-800 font-semibold">{al.patient?.full_name || 'Pasien'}</strong>
                    {al.patient?.email && <span className="text-slate-400">({al.patient.email})</span>}
                  </div>

                  <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed border border-slate-100">
                    {al.description}
                  </p>

                  {al.resolution_notes && (
                    <div className="text-xs text-emerald-900 bg-emerald-50/80 border border-emerald-100 p-2.5 rounded-lg">
                      <strong>Catatan Tindak Lanjut:</strong> {al.resolution_notes}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => onSelectPatient(al.patient_id)}
                      className="text-xs text-teal-700 font-medium hover:text-teal-800 inline-flex items-center gap-1"
                    >
                      <span>Buka Profil Pasien</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {al.status !== 'selesai' && !isDemoMode && (
                      <div className="w-full sm:w-auto">
                        {isResolving ? (
                          <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs w-full sm:w-96">
                            <input
                              type="text"
                              value={resolutionText}
                              onChange={(e) => setResolutionText(e.target.value)}
                              placeholder="Tuliskan catatan tindak lanjut..."
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setResolvingId(null)}
                                className="px-2.5 py-1 text-slate-500 hover:text-slate-700"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={updatingAlertId === al.id}
                                onClick={() => handleUpdateStatus(al, 'ditinjau')}
                                className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium disabled:opacity-50"
                              >
                                Tandai Ditinjau
                              </button>
                              <button
                                type="button"
                                disabled={updatingAlertId === al.id}
                                onClick={() => handleUpdateStatus(al, 'selesai')}
                                className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium disabled:opacity-50"
                              >
                                {updatingAlertId === al.id ? 'Menyimpan...' : 'Selesaikan'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setResolvingId(al.id);
                              setResolutionText('');
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                          >
                            Tindak Lanjut Klinis
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
