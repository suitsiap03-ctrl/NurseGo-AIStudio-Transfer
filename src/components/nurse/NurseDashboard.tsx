/**
 * Nurse Dashboard for NurseGo
 *
 * - Resolves actual nurse-patient relationships via `fetchNurseRelationships` (RPC + direct fallback)
 * - Computes live monitoring, clinical alert, and appointment (`patient_appointments`) metrics
 * - Renders interactive Recharts analytics (`NurseDashboardCharts`) from live Supabase records
 * - Distinguishes loading, error, and genuinely empty states (never forces `0` on query failures)
 * - Auto-refreshes via Realtime (including `notifications`), `refreshTrigger`, and tab focus
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { fetchNurseRelationships } from '../../lib/nurseRelationships';
import { DEMO_PATIENTS, DEMO_VITALS, DEMO_ALERTS } from '../../data/mockData';
import { formatLocalDate, getLocalDateInputValue } from '../../lib/dateUtils';
import { NurseDashboardCharts } from './NurseDashboardCharts';
import {
  Users,
  AlertTriangle,
  HeartPulse,
  UserPlus,
  Search,
  Activity,
  ArrowRight,
  ShieldAlert,
  RefreshCw,
  MailCheck,
  Copy,
  Check,
  UserCheck,
  X,
  Calendar,
  AlertCircle,
  ClipboardCheck,
} from 'lucide-react';
import {
  PainRecord,
  PatientAlert,
  PatientAppointment,
  PatientInvitation,
  RelationshipSummary,
  VitalSignRecord,
} from '../../types/database';

interface NurseDashboardProps {
  onSelectPatient: (patientId: string) => void;
  onNavigateTab: (tab: string) => void;
  onOpenAddPatient: () => void;
  refreshTrigger?: number;
}

interface MonitoringSummaryStats {
  reportsToday: number;
  patientsReportedToday: number;
  totalReports: number;
}

export const NurseDashboard: React.FC<NurseDashboardProps> = ({
  onSelectPatient,
  onNavigateTab,
  onOpenAddPatient,
  refreshTrigger = 0,
}) => {
  const { user, isDemoMode } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);

  const [patients, setPatients] = useState<any[]>([]);
  const [pendingConsentIncoming, setPendingConsentIncoming] = useState<RelationshipSummary[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PatientInvitation[]>([]);

  const [allAlerts, setAllAlerts] = useState<PatientAlert[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<VitalSignRecord[]>([]);
  const [painHistory, setPainHistory] = useState<PainRecord[]>([]);
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [monitoringStats, setMonitoringStats] = useState<MonitoringSummaryStats>({
    reportsToday: 0,
    patientsReportedToday: 0,
    totalReports: 0,
  });

  // Explicit per-domain error flags so query failures never get masked as `0`
  const [relationsError, setRelationsError] = useState<string | null>(null);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rpcNotice, setRpcNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [respondingConsentId, setRespondingConsentId] = useState<string | null>(null);

  const lastLoadAtRef = useRef<number>(0);

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    lastLoadAtRef.current = Date.now();

    if (isDemoMode) {
      const demoVitals = DEMO_PATIENTS.flatMap((dp) => dp.historicalVitals || []);
      const demoPain = DEMO_PATIENTS.flatMap((dp) => dp.historicalPain || []);
      const demoAppts = DEMO_PATIENTS.flatMap((dp) => dp.appointments || []);

      const demoPatientsList = DEMO_PATIENTS.map((dp) => {
        const pVitals = DEMO_VITALS.filter((v) => v.patient_id === dp.profile.id);
        const pAlerts = DEMO_ALERTS.filter(
          (a) => a.patient_id === dp.profile.id && a.status === 'aktif'
        );
        let highestAlert: string | null = null;
        if (pAlerts.some((a) => a.alert_level === 'darurat')) highestAlert = 'darurat';
        else if (pAlerts.some((a) => a.alert_level === 'urgent')) highestAlert = 'urgent';
        else if (pAlerts.some((a) => a.alert_level === 'waspada')) highestAlert = 'waspada';

        return {
          assignmentId: `demo-${dp.profile.id}`,
          patientId: dp.profile.id,
          fullName: dp.profile.full_name,
          email: dp.profile.email,
          phone: dp.profile.phone,
          surgery: dp.surgery,
          latestVital: pVitals[0],
          activeAlerts: pAlerts,
          highestAlert,
        };
      });

      const todayStr = getLocalDateInputValue();
      const sessionKeys = new Set<string>();
      const todayPatients = new Set<string>();
      const todaySessionKeys = new Set<string>();
      demoVitals.forEach((v) => {
        const sKey = `${v.patient_id}:${v.recorded_at.slice(0, 16)}`;
        sessionKeys.add(sKey);
        if (getLocalDateInputValue(new Date(v.recorded_at)) === todayStr) {
          todayPatients.add(v.patient_id);
          todaySessionKeys.add(sKey);
        }
      });

      setPatients(demoPatientsList);
      setPendingConsentIncoming([]);
      setPendingInvitations([]);
      setAllAlerts(DEMO_ALERTS);
      setVitalsHistory(demoVitals.length > 0 ? demoVitals : DEMO_VITALS);
      setPainHistory(demoPain);
      setAppointments(demoAppts);
      setMonitoringStats({
        reportsToday: todaySessionKeys.size,
        patientsReportedToday: todayPatients.size,
        totalReports: sessionKeys.size,
      });
      setRelationsError(null);
      setMonitoringError(null);
      setAlertsError(null);
      setAppointmentsError(null);
      setActionError(null);
      setRpcNotice(null);
      setLoading(false);
      setHasLoadedOnce(true);
      return;
    }

    setLoading(true);
    setRelationsError(null);
    setMonitoringError(null);
    setAlertsError(null);
    setAppointmentsError(null);
    setActionError(null);
    setRpcNotice(null);

    const supabase = getSupabase();

    try {
      // 1. Resolve actual active & incoming relationships + pending invitations
      const [relResult, invitesRes] = await Promise.all([
        fetchNurseRelationships(supabase, user.id),
        supabase
          .from('patient_invitations')
          .select('*')
          .eq('nurse_id', user.id)
          .neq('status', 'accepted')
          .order('created_at', { ascending: false }),
      ]);

      setRpcNotice(relResult.rpcNotice);
      setPendingConsentIncoming(relResult.pendingIncoming);

      if (invitesRes.error) {
        setActionError(`Gagal memuat daftar undangan tertunda: ${invitesRes.error.message}`);
      } else {
        setPendingInvitations((invitesRes.data as PatientInvitation[]) || []);
      }

      if (relResult.error) {
        setRelationsError(relResult.error);
        setPatients([]);
        setAllAlerts([]);
        setVitalsHistory([]);
        setPainHistory([]);
        setAppointments([]);
        return;
      }

      const activeAssignments = relResult.active;

      if (activeAssignments.length === 0) {
        setPatients([]);
        setAllAlerts([]);
        setVitalsHistory([]);
        setPainHistory([]);
        setAppointments([]);
        setMonitoringStats({ reportsToday: 0, patientsReportedToday: 0, totalReports: 0 });
        return;
      }

      const patientIds = activeAssignments.map((r) => r.patient_id);

      // 2. Fetch all clinical domains in parallel without artificially truncating stats/charts
      const [
        profRes,
        surgRes,
        vitRes,
        painRes,
        symRes,
        woundRes,
        alertRes,
        apptRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').in('id', patientIds),
        supabase
          .from('patient_surgeries')
          .select('*, surgery_type:surgery_types(*)')
          .in('patient_id', patientIds)
          .order('surgery_date', { ascending: false }),
        supabase
          .from('vital_sign_records')
          .select('*')
          .in('patient_id', patientIds)
          .order('recorded_at', { ascending: false })
          .limit(250),
        supabase
          .from('pain_records')
          .select('*')
          .in('patient_id', patientIds)
          .order('recorded_at', { ascending: false })
          .limit(250),
        supabase
          .from('symptom_records')
          .select('id, patient_id, recorded_at')
          .in('patient_id', patientIds)
          .order('recorded_at', { ascending: false })
          .limit(250),
        supabase
          .from('wound_records')
          .select('id, patient_id, recorded_at')
          .in('patient_id', patientIds)
          .order('recorded_at', { ascending: false })
          .limit(250),
        supabase
          .from('patient_alerts')
          .select('*')
          .in('patient_id', patientIds)
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('patient_appointments')
          .select('*')
          .in('patient_id', patientIds)
          .order('appointment_date', { ascending: true })
          .limit(150),
      ]);

      const profMap = new Map<string, any>(
        (profRes.data || []).map((prof: any) => [prof.id, prof])
      );

      if (profRes.error || surgRes.error) {
        const msg = (profRes.error || surgRes.error)?.message;
        setActionError((prev) => prev || `Sebagian profil pasien gagal dimuat: ${msg}`);
      }

      if (vitRes.error || painRes.error || symRes.error || woundRes.error) {
        const msg = (vitRes.error || painRes.error || symRes.error || woundRes.error)?.message;
        setMonitoringError(`Gagal memuat data monitoring: ${msg}`);
      }

      if (alertRes.error) {
        setAlertsError(`Gagal memuat data peringatan: ${alertRes.error.message}`);
      }

      if (apptRes.error) {
        setAppointmentsError(`Gagal memuat jadwal kontrol: ${apptRes.error.message}`);
      }

      const vitalsList = (vitRes.data as VitalSignRecord[]) || [];
      const painList = (painRes.data as PainRecord[]) || [];
      const symList = (symRes.data as any[]) || [];
      const woundList = (woundRes.data as any[]) || [];
      const alertsList = (alertRes.data as PatientAlert[]) || [];
      const apptsList = (apptRes.data as PatientAppointment[]) || [];

      setVitalsHistory(vitalsList);
      setPainHistory(painList);
      setAllAlerts(alertsList);
      setAppointments(apptsList);

      // Compute distinct monitoring report sessions across all 4 monitoring tables
      const todayStr = getLocalDateInputValue();
      const allSessionKeys = new Set<string>();
      const todaySessionKeys = new Set<string>();
      const todayPatientsSet = new Set<string>();

      const registerRecord = (patientId: string, recordedAt?: string) => {
        if (!recordedAt) return;
        const parsed = new Date(recordedAt);
        if (Number.isNaN(parsed.getTime())) return;
        const sessionKey = `${patientId}:${recordedAt.slice(0, 16)}`;
        allSessionKeys.add(sessionKey);
        if (getLocalDateInputValue(parsed) === todayStr) {
          todaySessionKeys.add(sessionKey);
          todayPatientsSet.add(patientId);
        }
      };

      vitalsList.forEach((r) => registerRecord(r.patient_id, r.recorded_at));
      painList.forEach((r) => registerRecord(r.patient_id, r.recorded_at));
      symList.forEach((r) => registerRecord(r.patient_id, r.recorded_at));
      woundList.forEach((r) => registerRecord(r.patient_id, r.recorded_at));

      setMonitoringStats({
        reportsToday: todaySessionKeys.size,
        patientsReportedToday: todayPatientsSet.size,
        totalReports: allSessionKeys.size,
      });

      const activeAlertsList = alertsList.filter((a) => a.status === 'aktif');

      const mergedPatients = activeAssignments.map((r) => {
        const p = profMap.get(r.patient_id);
        const surg = (surgRes.data || []).find((s: any) => s.patient_id === r.patient_id);
        const latestVit = vitalsList.find((v) => v.patient_id === r.patient_id);
        const patientAlerts = activeAlertsList.filter((a) => a.patient_id === r.patient_id);

        let highestAlert: string | null = null;
        if (patientAlerts.some((a) => a.alert_level === 'darurat')) highestAlert = 'darurat';
        else if (patientAlerts.some((a) => a.alert_level === 'urgent')) highestAlert = 'urgent';
        else if (patientAlerts.some((a) => a.alert_level === 'waspada')) highestAlert = 'waspada';

        return {
          assignmentId: r.id,
          patientId: r.patient_id,
          fullName:
            p?.full_name ||
            r.counterpart_name ||
            `Pasien #${String(r.patient_id).slice(0, 6)}`,
          email: p?.email || r.counterpart_email || '',
          phone: p?.phone || r.counterpart_phone || '-',
          assignedAt: r.assigned_at,
          surgery: surg,
          latestVital: latestVit,
          activeAlerts: patientAlerts,
          highestAlert,
        };
      });

      const priorityScore = (level: string | null) => {
        if (level === 'darurat') return 3;
        if (level === 'urgent') return 2;
        if (level === 'waspada') return 1;
        return 0;
      };
      mergedPatients.sort((a, b) => priorityScore(b.highestAlert) - priorityScore(a.highestAlert));

      setPatients(mergedPatients);
    } catch (err: any) {
      setRelationsError(err?.message || 'Gagal memuat data dashboard dari Supabase.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshTrigger]);

  // Refresh cleanly when returning focus to tab after >=5s in Live Mode
  useEffect(() => {
    if (isDemoMode || !user) return;
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadAtRef.current > 5000) {
        loadDashboardData();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isDemoMode, user, loadDashboardData]);

  // Subscribe to all relevant tables including nurse notifications so dashboard stays in sync
  useRealtimeSubscription(
    `nurse-dash-${user?.id || 'anon'}`,
    user && !isDemoMode
      ? [
          { table: 'patient_nurse_assignments', filter: `nurse_id=eq.${user.id}` },
          { table: 'patient_invitations', filter: `nurse_id=eq.${user.id}` },
          { table: 'notifications', filter: `user_id=eq.${user.id}` },
          { table: 'vital_sign_records' },
          { table: 'pain_records' },
          { table: 'symptom_records' },
          { table: 'wound_records' },
          { table: 'patient_alerts' },
          { table: 'patient_appointments' },
        ]
      : [],
    loadDashboardData,
    Boolean(user && !isDemoMode)
  );

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleRespondConsent = async (assignmentId: string, accept: boolean) => {
    setRespondingConsentId(assignmentId);
    setActionError(null);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('respond_nurse_patient_assignment', {
        p_assignment_id: assignmentId,
        p_accept: accept,
      });
      if (error) {
        throw new Error(
          isMissingRpcError(error)
            ? 'Fungsi `respond_nurse_patient_assignment` belum tersedia di Supabase.'
            : error.message
        );
      }
      if (!data?.success) throw new Error(data?.reason || 'Gagal merespons permintaan.');
      await loadDashboardData();
    } catch (err: any) {
      setActionError(`Gagal memproses persetujuan pasien: ${err.message}`);
    } finally {
      setRespondingConsentId(null);
    }
  };

  const getPatientNameById = (patientId: string) => {
    const match = patients.find((p) => p.patientId === patientId);
    return match?.fullName || `Pasien #${patientId.substring(0, 6)}`;
  };

  const todayStr = getLocalDateInputValue();
  const activeAlertsList = allAlerts.filter((a) => a.status === 'aktif');
  const upcomingAppointments = appointments
    .filter((a) => a.status === 'terjadwal' && a.appointment_date >= todayStr)
    .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));

  const isInitialLoading = loading && !hasLoadedOnce;
  const hasRelationsFailure = Boolean(relationsError);
  const hasMonitoringFailure = hasRelationsFailure || Boolean(monitoringError);
  const hasAlertsFailure = hasRelationsFailure || Boolean(alertsError);
  const hasAppointmentsFailure = hasRelationsFailure || Boolean(appointmentsError);

  const totalActivePatients = patients.length;
  const activeAlertsCount = activeAlertsList.length;
  const upcomingAppointmentsCount = upcomingAppointments.length;

  const filteredPatients = patients.filter(
    (p) =>
      p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.surgery?.surgery_type?.name &&
        p.surgery.surgery_type.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredInvites = pendingInvitations.filter(
    (inv) =>
      inv.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.patient_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const combinedGlobalError = relationsError || actionError;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Dashboard Pemantauan Perawat
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring asuhan keperawatan pasien pascaoperasi di rumah secara real-time dan terstruktur.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadDashboardData()}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onOpenAddPatient}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah / Undang Pasien</span>
          </button>
        </div>
      </div>

      {combinedGlobalError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{combinedGlobalError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadDashboardData()}
            className="self-start sm:self-center px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-900 font-semibold rounded-lg shrink-0"
          >
            Muat Ulang
          </button>
        </div>
      )}

      {rpcNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
          {rpcNotice}
        </div>
      )}

      {pendingConsentIncoming.length > 0 && (
        <div className="bg-teal-50/90 border-2 border-teal-500 rounded-xl p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-teal-950">
              <UserCheck className="w-4 h-4 text-teal-700" />
              <span>
                {pendingConsentIncoming.length} Pasien Mengundang Anda sebagai Perawat Pendamping
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('pasien')}
              className="text-teal-700 hover:text-teal-900 font-semibold underline"
            >
              Kelola di Daftar Pasien
            </button>
          </div>
          <div className="space-y-2">
            {pendingConsentIncoming.map((rel) => (
              <div
                key={rel.id}
                className="bg-white p-3 rounded-lg border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <span className="font-bold text-slate-900">{rel.counterpart_name}</span>{' '}
                  {rel.counterpart_email && (
                    <span className="text-slate-500">({rel.counterpart_email})</span>
                  )}
                  {rel.notes && <p className="text-[11px] text-slate-600 mt-0.5">Catatan: {rel.notes}</p>}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={respondingConsentId === rel.id}
                    onClick={() => handleRespondConsent(rel.id, false)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-semibold rounded-lg inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Tolak</span>
                  </button>
                  <button
                    type="button"
                    disabled={respondingConsentId === rel.id}
                    onClick={() => handleRespondConsent(rel.id, true)}
                    className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Terima</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Live Summary Cards (Patients, Monitoring, Alerts, Appointments) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pasien Terhubung */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Pasien Terhubung</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isInitialLoading ? (
              <span className="text-xl font-bold text-slate-400 animate-pulse">...</span>
            ) : hasRelationsFailure ? (
              <span className="text-2xl font-bold text-rose-600">—</span>
            ) : (
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {totalActivePatients}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {isInitialLoading
                ? 'memuat'
                : hasRelationsFailure
                ? 'gagal memuat'
                : `aktif${pendingInvitations.length > 0 ? ` · ${pendingInvitations.length} undangan` : ''}`}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {hasRelationsFailure
              ? 'Periksa koneksi untuk memuat relasi pasien'
              : 'Relasi perawat–pasien yang aktif & disetujui'}
          </p>
        </div>

        {/* Card 2: Statistik Monitoring */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Laporan Monitoring</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isInitialLoading ? (
              <span className="text-xl font-bold text-slate-400 animate-pulse">...</span>
            ) : hasMonitoringFailure ? (
              <span className="text-2xl font-bold text-rose-600">—</span>
            ) : (
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {monitoringStats.totalReports}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {isInitialLoading
                ? 'memuat'
                : hasMonitoringFailure
                ? 'gagal memuat'
                : 'total laporan'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {hasMonitoringFailure
              ? monitoringError || 'Data monitoring tidak tersedia'
              : `${monitoringStats.reportsToday} laporan hari ini (${monitoringStats.patientsReportedToday} pasien)`}
          </p>
        </div>

        {/* Card 3: Peringatan Aktif */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Peringatan Aktif</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isInitialLoading ? (
              <span className="text-xl font-bold text-slate-400 animate-pulse">...</span>
            ) : hasAlertsFailure ? (
              <span className="text-2xl font-bold text-rose-600">—</span>
            ) : (
              <span
                className={`text-2xl font-bold tracking-tight tabular-nums ${
                  activeAlertsCount > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {activeAlertsCount}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {isInitialLoading
                ? 'memuat'
                : hasAlertsFailure
                ? 'gagal memuat'
                : 'perlu tindak lanjut'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {hasAlertsFailure
              ? alertsError || 'Data peringatan tidak tersedia'
              : activeAlertsCount > 0
              ? `${activeAlertsList.filter((a) => a.alert_level === 'darurat').length} darurat · ${activeAlertsList.filter((a) => a.alert_level === 'urgent').length} urgent`
              : 'Tidak ada peringatan klinis aktif'}
          </p>
        </div>

        {/* Card 4: Jadwal Kontrol */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Jadwal Kontrol</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            {isInitialLoading ? (
              <span className="text-xl font-bold text-slate-400 animate-pulse">...</span>
            ) : hasAppointmentsFailure ? (
              <span className="text-2xl font-bold text-rose-600">—</span>
            ) : (
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {upcomingAppointmentsCount}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {isInitialLoading
                ? 'memuat'
                : hasAppointmentsFailure
                ? 'gagal memuat'
                : 'terjadwal'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {hasAppointmentsFailure
              ? appointmentsError || 'Jadwal kontrol tidak tersedia'
              : upcomingAppointments[0]
              ? `Terdekat: ${formatLocalDate(upcomingAppointments[0].appointment_date)}`
              : 'Belum ada jadwal kontrol mendatang'}
          </p>
        </div>
      </div>

      {/* Interactive Recharts Dashboard Chart */}
      <NurseDashboardCharts
        patients={patients.map((p) => ({ patientId: p.patientId, fullName: p.fullName }))}
        vitals={vitalsHistory}
        painRecords={painHistory}
        alerts={allAlerts}
        loading={isInitialLoading}
        error={relationsError || monitoringError || alertsError}
        onRetry={loadDashboardData}
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Daftar Pasien Berdasarkan Prioritas
                </h2>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari pasien / jenis operasi..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600 mb-2" />
                <span>Memuat data pasien dari Supabase...</span>
              </div>
            ) : relationsError ? (
              <div className="p-8 text-center text-xs text-rose-800 space-y-3 bg-rose-50/50">
                <AlertCircle className="w-7 h-7 mx-auto text-rose-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Gagal memuat daftar pasien</p>
                  <p className="text-rose-700 max-w-md mx-auto">{relationsError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => loadDashboardData()}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Coba Lagi</span>
                </button>
              </div>
            ) : filteredPatients.length === 0 && filteredInvites.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 space-y-3">
                <Users className="w-8 h-8 mx-auto text-slate-300" />
                <p className="font-medium text-slate-700">
                  {searchQuery.trim()
                    ? 'Tidak ada pasien yang cocok dengan pencarian Anda'
                    : 'Belum ada pasien yang terhubung kepada Anda'}
                </p>
                {!searchQuery.trim() && (
                  <>
                    <p className="text-slate-400 max-w-sm mx-auto">
                      Tambahkan pasien baru atau kirim undangan aktivasi akun untuk memulai pemantauan di rumah.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenAddPatient}
                      className="px-3.5 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 inline-flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Tambah Pasien Sekarang</span>
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredPatients.map((patient) => {
                  const surgeryName = patient.surgery?.surgery_type?.name || 'Pasca Bedah';
                  const alertLevel = patient.highestAlert;
                  return (
                    <div
                      key={patient.patientId}
                      className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-semibold text-sm text-slate-900">
                            {patient.fullName}
                          </span>
                          {alertLevel === 'darurat' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              DARURAT
                            </span>
                          )}
                          {alertLevel === 'urgent' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              URGENT
                            </span>
                          )}
                          {alertLevel === 'waspada' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800">
                              WASPADA
                            </span>
                          )}
                          {!alertLevel && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                              Stabil
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="font-medium text-slate-700">{surgeryName}</span>
                          {patient.surgery?.surgery_date && (
                            <span>· Op: {formatLocalDate(patient.surgery.surgery_date)}</span>
                          )}
                          {patient.email && <span>· {patient.email}</span>}
                        </div>

                        {patient.latestVital ? (
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 tabular-nums">
                            <span>
                              TD:{' '}
                              <strong className="text-slate-800">
                                {patient.latestVital.systolic_bp}/{patient.latestVital.diastolic_bp}
                              </strong>
                            </span>
                            <span>
                              Nadi:{' '}
                              <strong className="text-slate-800">
                                {patient.latestVital.heart_rate} bpm
                              </strong>
                            </span>
                            <span>
                              Suhu:{' '}
                              <strong className="text-slate-800">
                                {patient.latestVital.body_temperature}°C
                              </strong>
                            </span>
                            <span>
                              SpO2:{' '}
                              <strong className="text-slate-800">
                                {patient.latestVital.oxygen_saturation}%
                              </strong>
                            </span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            Belum ada laporan tanda vital
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectPatient(patient.patientId)}
                        className="self-end sm:self-center px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>Buka Detail</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {/* Pending Invitations Section */}
                {filteredInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-sm text-slate-900">{inv.patient_name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                          <MailCheck className="w-3 h-3" />
                          Menunggu Aktivasi Pasien
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                        <span>{inv.patient_email}</span>
                        <span>
                          · Kode: <strong className="font-mono text-teal-700">{inv.token}</strong>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyToken(inv.token)}
                      className="self-end sm:self-center px-3 py-1.5 text-xs font-medium text-amber-900 bg-white border border-amber-200 hover:bg-amber-50 rounded-lg inline-flex items-center gap-1.5"
                    >
                      {copiedToken === inv.token ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Kode Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Kode</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6 min-w-0">
          {/* Peringatan Klinis */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <h2 className="text-sm font-semibold text-slate-900">Peringatan Klinis</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('peringatan')}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                Lihat Semua
              </button>
            </div>

            {isInitialLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Memuat peringatan...</div>
            ) : hasAlertsFailure ? (
              <div className="p-5 text-center text-xs text-rose-700 bg-rose-50/50 space-y-2">
                <p>{alertsError || relationsError}</p>
                <button
                  type="button"
                  onClick={() => loadDashboardData()}
                  className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold"
                >
                  Coba Lagi
                </button>
              </div>
            ) : activeAlertsList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Tidak ada peringatan aktif saat ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeAlertsList.slice(0, 4).map((al) => {
                  const isDarurat = al.alert_level === 'darurat';
                  const isUrgent = al.alert_level === 'urgent';
                  return (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => onSelectPatient(al.patient_id)}
                      className="w-full text-left p-3.5 space-y-1 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span
                          className={`font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded truncate ${
                            isDarurat
                              ? 'bg-rose-100 text-rose-800'
                              : isUrgent
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {al.alert_level} · {getPatientNameById(al.patient_id)}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(al.created_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-800 line-clamp-2">{al.title}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-2">{al.description}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Jadwal Kontrol Mendatang */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-600" />
                <h2 className="text-sm font-semibold text-slate-900">Jadwal Kontrol Pasien</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('pasien')}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                Kelola
              </button>
            </div>

            {isInitialLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Memuat jadwal kontrol...</div>
            ) : hasAppointmentsFailure ? (
              <div className="p-5 text-center text-xs text-rose-700 bg-rose-50/50 space-y-2">
                <p>{appointmentsError || relationsError}</p>
                <button
                  type="button"
                  onClick={() => loadDashboardData()}
                  className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold"
                >
                  Coba Lagi
                </button>
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Belum ada jadwal kontrol terjadwal.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingAppointments.slice(0, 4).map((appt) => (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={() => onSelectPatient(appt.patient_id)}
                    className="w-full text-left p-3.5 text-xs space-y-1 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 truncate">
                        {getPatientNameById(appt.patient_id)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-semibold shrink-0">
                        {formatLocalDate(appt.appointment_date)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 truncate">
                      {appt.appointment_time ? `${appt.appointment_time} WIB · ` : ''}
                      {appt.location}
                    </p>
                    {appt.doctor_name && (
                      <p className="text-[10px] text-slate-400 truncate">{appt.doctor_name}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Monitoring Masuk Terbaru */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-semibold text-slate-900">Monitoring Masuk Terbaru</h2>
            </div>

            {isInitialLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Memuat monitoring...</div>
            ) : hasMonitoringFailure ? (
              <div className="p-5 text-center text-xs text-rose-700 bg-rose-50/50 space-y-2">
                <p>{monitoringError || relationsError}</p>
                <button
                  type="button"
                  onClick={() => loadDashboardData()}
                  className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold"
                >
                  Coba Lagi
                </button>
              </div>
            ) : vitalsHistory.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Belum ada data monitoring tanda vital yang masuk.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {vitalsHistory.slice(0, 4).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectPatient(v.patient_id)}
                    className="w-full text-left p-3 text-xs space-y-1 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span className="font-semibold text-teal-700">
                        {getPatientNameById(v.patient_id)}
                      </span>
                      <span>
                        {new Date(v.recorded_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-800 font-medium tabular-nums">
                      <span>
                        TD: {v.systolic_bp}/{v.diastolic_bp}
                      </span>
                      <span>Suhu: {v.body_temperature}°C</span>
                      <span>SpO2: {v.oxygen_saturation}%</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
