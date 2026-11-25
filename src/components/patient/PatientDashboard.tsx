/**
 * Patient Dashboard for NurseGo
 *
 * Features:
 * - Warm greeting & accurate recovery day counter
 * - Real-time sync with assigned nurse's medications, appointments, alerts & messages
 * - Daily monitoring prompt & quick direct message action
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { DEMO_PATIENTS, DEMO_NURSE } from '../../data/mockData';
import { matchEducationBySurgeryName } from '../../lib/surgeryTemplates';
import {
  formatLocalDate,
  getLocalDateInputValue,
  getLocalStartOfDayIso,
  parseLocalDate,
} from '../../lib/dateUtils';
import {
  HeartPulse,
  Pill,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  MessageSquare,
  AlertTriangle,
  Users,
  BellRing,
  AlertCircle,
} from 'lucide-react';
import {
  PatientMedication,
  PatientAppointment,
  PatientAlert,
  RelationshipSummary,
} from '../../types/database';

interface PatientDashboardProps {
  onNavigateTab: (tab: string) => void;
}

export const PatientDashboard: React.FC<PatientDashboardProps> = ({ onNavigateTab }) => {
  const { user, profile, patientSurgery, isDemoMode } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rpcNotice, setRpcNotice] = useState<string | null>(null);
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [upcomingAppointment, setUpcomingAppointment] = useState<PatientAppointment | null>(null);
  const [activeAlerts, setActiveAlerts] = useState<PatientAlert[]>([]);
  const [hasReportedToday, setHasReportedToday] = useState<boolean>(false);
  const [activeNurses, setActiveNurses] = useState<RelationshipSummary[]>([]);
  const [pendingNurseRequests, setPendingNurseRequests] = useState<RelationshipSummary[]>([]);

  const loadPatientData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    setRpcNotice(null);

    if (isDemoMode) {
      const demo = DEMO_PATIENTS[0];
      setActiveNurses([
        {
          id: 'demo-assign-1',
          patient_id: user.id,
          nurse_id: DEMO_NURSE.id,
          is_active: true,
          status: 'active',
          relationship_role: 'perawat_penanggung_jawab',
          counterpart_id: DEMO_NURSE.id,
          counterpart_role: 'nurse',
          counterpart_name: DEMO_NURSE.full_name,
          counterpart_email: DEMO_NURSE.email,
          professional_title: DEMO_NURSE.nurse_profile.professional_title,
          hospital_name: DEMO_NURSE.nurse_profile.hospital_name,
          department: DEMO_NURSE.nurse_profile.department,
          verification_status: DEMO_NURSE.nurse_profile.verification_status,
        },
      ]);
      setPendingNurseRequests([]);
      setMedications(demo.medications);
      setUpcomingAppointment(demo.appointments[0] || null);
      setActiveAlerts(demo.activeAlerts.filter((a) => a.status === 'aktif' || a.status === 'ditinjau'));
      setHasReportedToday(false);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    try {
      // 1. Fetch all nurse-patient relationships via SECURITY DEFINER RPC (with active fallback)
      const { data: relData, error: relErr } = await supabase.rpc(
        'get_my_nurse_patient_relationships'
      );

      if (!relErr && Array.isArray(relData)) {
        const list = relData as RelationshipSummary[];
        setActiveNurses(list.filter((r) => r.is_active && r.status === 'active' && !r.ended_at));
        setPendingNurseRequests(list.filter((r) => r.status === 'pending_patient' && !r.ended_at));
      } else {
        if (relErr) {
          setRpcNotice(
            isMissingRpcError(relErr)
              ? 'Fungsi backend relasi multi-perawat (`004_live_sync_consent_rpcs_and_mvp.sql`) belum diterapkan di Supabase. Permintaan penautan perawat baru belum dapat dimuat hingga migrasi dijalankan.'
              : `Sebagian data relasi tidak dapat dimuat (${relErr.message}).`
          );
        }
        const { data: assignList, error: assignErr } = await supabase
          .from('patient_nurse_assignments')
          .select('id, patient_id, nurse_id, is_active, relationship_role')
          .eq('patient_id', user.id)
          .eq('is_active', true)
          .eq('status', 'active')
          .is('ended_at', null);

        if (assignErr) {
          setErrorMsg(`Gagal memuat tim perawat: ${assignErr.message}`);
          setActiveNurses([]);
        } else if (assignList && assignList.length > 0) {
          const nurseIds = assignList.map((a: any) => a.nurse_id);
          const [{ data: nurseProfs }, { data: nurseDetails }] = await Promise.all([
            supabase.from('profiles').select('id, full_name, email, phone').in('id', nurseIds),
            supabase
              .from('nurse_profiles')
              .select('id, professional_title, hospital_name, department, verification_status')
              .in('id', nurseIds),
          ]);
          const profMap = new Map((nurseProfs || []).map((p: any) => [p.id, p]));
          const detMap = new Map((nurseDetails || []).map((d: any) => [d.id, d]));

          setActiveNurses(
            assignList.map((a: any) => {
              const p = profMap.get(a.nurse_id) || {};
              const d = detMap.get(a.nurse_id) || {};
              return {
                id: a.id,
                patient_id: a.patient_id,
                nurse_id: a.nurse_id,
                is_active: true,
                status: 'active',
                relationship_role: a.relationship_role || 'perawat_penanggung_jawab',
                counterpart_id: a.nurse_id,
                counterpart_role: 'nurse',
                counterpart_name: p.full_name || 'Perawat',
                counterpart_email: p.email || '',
                counterpart_phone: p.phone,
                professional_title: d.professional_title,
                hospital_name: d.hospital_name,
                department: d.department,
                verification_status: d.verification_status,
              } as RelationshipSummary;
            })
          );
        } else {
          setActiveNurses([]);
        }
        setPendingNurseRequests([]);
      }

      // 2-5. Fetch medications, vitals today, appointment, alerts in parallel
      const todayStr = getLocalDateInputValue();
      const todayStartIso = getLocalStartOfDayIso();
      const [medsRes, vitalsRes, apptRes, alertsRes] = await Promise.all([
        supabase
          .from('patient_medications')
          .select('*')
          .eq('patient_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('vital_sign_records')
          .select('id, recorded_at')
          .eq('patient_id', user.id)
          .gte('recorded_at', todayStartIso)
          .limit(1),
        supabase
          .from('patient_appointments')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'terjadwal')
          .gte('appointment_date', todayStr)
          .order('appointment_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('patient_alerts')
          .select('*')
          .eq('patient_id', user.id)
          .in('status', ['aktif', 'ditinjau'])
          .order('created_at', { ascending: false }),
      ]);

      const queryErr = medsRes.error || vitalsRes.error || apptRes.error || alertsRes.error;
      if (queryErr) {
        setErrorMsg((prev) => prev || `Gagal memuat sebagian data dashboard: ${queryErr.message}`);
      }

      setMedications((medsRes.data as PatientMedication[]) || []);
      setHasReportedToday(Boolean(vitalsRes.data && vitalsRes.data.length > 0));
      setUpcomingAppointment((apptRes.data as PatientAppointment) || null);
      setActiveAlerts((alertsRes.data as PatientAlert[]) || []);
    } catch (err: any) {
      console.error('Error loading patient dashboard:', err);
      setErrorMsg(err?.message || 'Terjadi kesalahan saat memuat dashboard pasien.');
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  useRealtimeSubscription(
    `patient-dashboard-${user?.id || 'anon'}`,
    user && !isDemoMode
      ? [
          { table: 'patient_medications', filter: `patient_id=eq.${user.id}` },
          { table: 'patient_appointments', filter: `patient_id=eq.${user.id}` },
          { table: 'patient_alerts', filter: `patient_id=eq.${user.id}` },
          { table: 'vital_sign_records', filter: `patient_id=eq.${user.id}` },
          { table: 'patient_nurse_assignments', filter: `patient_id=eq.${user.id}` },
        ]
      : [],
    loadPatientData,
    Boolean(user && !isDemoMode)
  );

  // Compute day of recovery accurately using local calendar dates
  let recoveryLabel = 'Pemantauan Pascaoperasi Aktif';
  if (patientSurgery?.surgery_date) {
    const opDate = parseLocalDate(patientSurgery.surgery_date);
    if (opDate) {
      const today = new Date();
      const opMidnight = new Date(opDate.getFullYear(), opDate.getMonth(), opDate.getDate()).getTime();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const diffDays = Math.floor((todayMidnight - opMidnight) / 86400000);
      if (diffDays >= 0) {
        recoveryLabel = `Hari Pemulihan ke-${diffDays + 1} Pascaoperasi`;
      } else {
        recoveryLabel = `Operasi Terjadwal (${Math.abs(diffDays)} hari lagi)`;
      }
    }
  }

  const surgeryName = patientSurgery?.surgery_type?.name || 'Perawatan Pascaoperasi';
  const matchedEducation = matchEducationBySurgeryName(patientSurgery?.surgery_type?.name);
  const primaryNurse = activeNurses[0] || null;

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-teal-700 to-teal-900 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-teal-500/30 text-teal-100 border border-teal-400/30 uppercase tracking-wide">
            {recoveryLabel}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Selamat Datang, {profile?.full_name || 'Pasien'}
          </h1>
          <p className="text-xs sm:text-sm text-teal-100 max-w-xl">
            Tindakan operasi: <strong className="text-white font-semibold">{surgeryName}</strong>.
            Terus jaga kebersihan luka, hidrasi cukup, dan laporkan kondisi harian Anda secara teratur.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => loadPatientData()}
            className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold shrink-0"
          >
            Muat Ulang
          </button>
        </div>
      )}

      {rpcNotice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs">
          {rpcNotice}
        </div>
      )}

      {/* Pending Nurse Link Consent Banner */}
      {pendingNurseRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-amber-900">
                {pendingNurseRequests.length} Permintaan Penautan Perawat Menunggu Persetujuan Anda
              </h2>
              <p className="text-amber-800 mt-0.5">
                {pendingNurseRequests[0].professional_title || pendingNurseRequests[0].counterpart_name}{' '}
                mengajukan akses pemantauan perawatan Anda. Perawat belum dapat melihat data Anda
                sebelum Anda menyetujuinya.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('profil')}
            className="self-start sm:self-center px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold shrink-0"
          >
            Tinjau di Profil
          </button>
        </div>
      )}

      {/* Active & Nurse-Reviewed Alert Warning Banner */}
      {activeAlerts.length > 0 && (
        <div
          className={`rounded-xl p-4 flex items-start gap-3 shadow-xs border-2 ${
            activeAlerts[0].status === 'ditinjau'
              ? 'bg-amber-50 border-amber-400 text-amber-950'
              : 'bg-rose-50 border-rose-500 text-rose-950'
          }`}
        >
          <ShieldAlert
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              activeAlerts[0].status === 'ditinjau' ? 'text-amber-600' : 'text-rose-600'
            }`}
          />
          <div className="space-y-1 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                className={`text-xs font-bold uppercase tracking-wider ${
                  activeAlerts[0].status === 'ditinjau' ? 'text-amber-900' : 'text-rose-800'
                }`}
              >
                Pemberitahuan Tim Keperawatan ({activeAlerts[0].alert_level.toUpperCase()})
                {activeAlerts.length > 1 ? ` · ${activeAlerts.length} Peringatan` : ''}
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  activeAlerts[0].status === 'ditinjau'
                    ? 'bg-amber-200/80 text-amber-900'
                    : 'bg-rose-200/80 text-rose-900'
                }`}
              >
                {activeAlerts[0].status === 'ditinjau' ? 'Sedang Ditinjau Perawat' : 'Aktif'}
              </span>
            </div>
            <p className="text-xs font-medium">{activeAlerts[0].title}</p>
            <p className="text-[11px] leading-relaxed opacity-90">
              {activeAlerts[0].description}
            </p>
            {activeAlerts[0].resolution_notes && (
              <div className="mt-1.5 p-2 bg-white/80 border border-black/10 rounded-lg text-[11px] text-slate-800">
                <strong>Tindak Lanjut Perawat:</strong> {activeAlerts[0].resolution_notes}
              </div>
            )}
            <p className="text-[11px] italic pt-1 opacity-85">
              Bila keluhan memburuk atau nyeri hebat berlanjut, segera hubungi perawat penanggung
              jawab Anda atau kunjungi IGD terdekat.
            </p>
          </div>
        </div>
      )}

      {/* Daily Monitoring Action Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4 text-center sm:text-left">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              hasReportedToday ? 'bg-emerald-50 text-emerald-600' : 'bg-teal-50 text-teal-600'
            }`}
          >
            {hasReportedToday ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <HeartPulse className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              {hasReportedToday
                ? 'Laporan Pemantauan Hari Ini Telah Dikirim'
                : 'Lakukan Pemantauan Mandiri Hari Ini'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {hasReportedToday
                ? 'Terima kasih telah melaporkan kondisi Anda. Anda tetap dapat memperbarui jika ada keluhan baru.'
                : 'Periksa tanda vital (tekanan darah, suhu), skala nyeri, dan kondisi luka jahitan Anda.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('pantau')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors whitespace-nowrap shadow-xs ${
            hasReportedToday
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              : 'bg-teal-600 hover:bg-teal-700 text-white'
          }`}
        >
          <span>{hasReportedToday ? 'Perbarui Laporan' : 'Isi Pantauan Sekarang'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Medications Snapshot */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-teal-600" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                Pengingat Jadwal Obat
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('perawatan:obat')}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold"
            >
              Kelola Obat
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400 py-4 text-center">Memuat jadwal obat...</p>
          ) : medications.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              Belum ada daftar resep obat aktif dari perawat Anda.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {medications.slice(0, 3).map((m) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900">{m.medication_name}</span>
                    <div className="text-[11px] text-slate-500">
                      {m.dosage} · {m.frequency}
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigateTab('perawatan:obat')}
                    className="px-2.5 py-1 text-[11px] bg-teal-50 hover:bg-teal-100 text-teal-700 font-medium rounded-lg shrink-0"
                  >
                    Catat Minum
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Appointment & Assigned Nurse Team Card */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                  Jadwal Kontrol Berikutnya
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('perawatan:kontrol')}
                className="text-xs text-teal-600 hover:text-teal-700 font-semibold"
              >
                Lihat Semua
              </button>
            </div>

            {upcomingAppointment ? (
              <div className="text-xs space-y-1 pt-1">
                <div className="font-bold text-sm text-teal-900">
                  {formatLocalDate(upcomingAppointment.appointment_date, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-slate-600">
                  Waktu:{' '}
                  <strong>Pukul {upcomingAppointment.appointment_time || '09:00'} WIB</strong>
                </div>
                <div className="text-slate-600">
                  Lokasi: <strong>{upcomingAppointment.location}</strong>
                </div>
                {upcomingAppointment.doctor_name && (
                  <div className="text-slate-500 text-[11px]">
                    Dokter: {upcomingAppointment.doctor_name}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">
                Belum ada jadwal kontrol terjadwal.
              </p>
            )}
          </div>

          {/* Assigned Nurse Team Info + Quick Message */}
          <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {activeNurses.length > 1 ? (
                    <Users className="w-5 h-5" />
                  ) : (
                    <UserCheck className="w-5 h-5" />
                  )}
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-teal-800 font-semibold uppercase tracking-wider">
                      Tim Perawat Penanggung Jawab
                    </span>
                    {activeNurses.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">
                        {activeNurses.length} Perawat Aktif
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900 text-sm">
                    {primaryNurse
                      ? primaryNurse.professional_title || primaryNurse.counterpart_name
                      : 'Belum terhubung dengan perawat'}
                  </div>
                  <div className="text-slate-600 text-[11px]">
                    {primaryNurse
                      ? `${primaryNurse.hospital_name || 'Faskes Mitra'}${
                          primaryNurse.counterpart_email
                            ? ` · ${primaryNurse.counterpart_email}`
                            : ''
                        }`
                      : 'Gunakan kode undangan perawat untuk terhubung'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeNurses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('perawatan:pesan')}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Pesan Perawat</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigateTab('profil')}
                  className="px-3 py-1.5 bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold"
                >
                  Kelola Tim
                </button>
              </div>
            </div>

            {activeNurses.length > 1 && (
              <div className="pt-2 border-t border-teal-200/70 flex flex-wrap gap-1.5 text-[11px]">
                {activeNurses.slice(1).map((n) => (
                  <span
                    key={n.id}
                    className="px-2 py-0.5 bg-white border border-teal-200 rounded text-teal-900 font-medium"
                  >
                    Pendamping: {n.professional_title || n.counterpart_name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger Signs Quick Reference Card */}
      <div className="bg-white rounded-xl border border-rose-200 p-5 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-rose-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-rose-900">
              Tanda Bahaya & Kapan Harus Mencari Pertolongan ({matchedEducation.surgery_name})
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('perawatan:edukasi')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 self-start sm:self-center"
          >
            Lihat Panduan Lengkap
          </button>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs text-rose-900">
          {matchedEducation.danger_signs.slice(0, 3).map((sign, idx) => (
            <li
              key={idx}
              className="bg-rose-50/70 border border-rose-100 rounded-lg p-3 leading-relaxed font-medium"
            >
              {sign}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
