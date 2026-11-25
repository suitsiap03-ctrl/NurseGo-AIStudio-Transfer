/**
 * Patient Care & Education for NurseGo
 *
 * Subtabs:
 * 1. Jadwal & Kepatuhan Obat (joined medication names + DB error check + nurse notification)
 * 2. Jadwal Kontrol Pascaoperasi
 * 3. Edukasi Perawatan Mandiri (custom nurse instructions + 7 surgery types)
 * 4. Pesan Perawat (Real-time chat with assigned nurse)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { notifyAssignedNurses } from '../../lib/notifications';
import { SURGERY_EDUCATION_DATA } from '../../data/educationData';
import { DEMO_PATIENTS, DEMO_NURSE } from '../../data/mockData';
import { matchEducationBySurgeryName } from '../../lib/surgeryTemplates';
import { formatLocalDate } from '../../lib/dateUtils';
import { PatientNurseChat } from '../common/PatientNurseChat';
import {
  Pill,
  Calendar,
  BookOpen,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  HeartPulse,
  Apple,
  ShowerHead,
  ShieldCheck,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  PatientMedication,
  MedicationAdherenceLog,
  PatientAppointment,
  PostOpEducation,
  AdherenceStatus,
  PatientEducationAssignment,
  RelationshipSummary,
} from '../../types/database';

type CareSubTab = 'obat' | 'kontrol' | 'edukasi' | 'pesan';

interface AdherenceWithMed extends Omit<MedicationAdherenceLog, 'medication'> {
  medication?: { medication_name: string; dosage: string } | null;
}

interface PatientCareProps {
  initialSubTab?: string;
}

export const PatientCare: React.FC<PatientCareProps> = ({ initialSubTab }) => {
  const { user, profile, patientSurgery, isDemoMode } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<CareSubTab>('obat');
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceWithMed[]>([]);
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [customEduList, setCustomEduList] = useState<PatientEducationAssignment[]>([]);
  const [assignedNurses, setAssignedNurses] = useState<
    Array<{ id: string; name: string; title?: string; roleLabel?: string }>
  >([]);
  const [selectedNurseId, setSelectedNurseId] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rpcNotice, setRpcNotice] = useState<string | null>(null);

  const [selectedEdu, setSelectedEdu] = useState<PostOpEducation>(() =>
    matchEducationBySurgeryName(patientSurgery?.surgery_type?.name)
  );

  useEffect(() => {
    if (patientSurgery?.surgery_type?.name) {
      setSelectedEdu(matchEducationBySurgeryName(patientSurgery.surgery_type.name));
    }
  }, [patientSurgery?.surgery_type?.name]);

  const [loggingMedId, setLoggingMedId] = useState<string | null>(null);
  const [logNotes, setLogNotes] = useState<string>('');
  const [submittingLog, setSubmittingLog] = useState(false);
  const [markingEduId, setMarkingEduId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialSubTab) return;
    const map: Record<string, CareSubTab> = {
      obat: 'obat',
      kontrol: 'kontrol',
      edukasi: 'edukasi',
      pesan: 'pesan',
      messages: 'pesan',
    };
    if (map[initialSubTab]) setActiveSubTab(map[initialSubTab]);
  }, [initialSubTab]);

  const loadCareData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFetchError(null);
    setRpcNotice(null);

    if (isDemoMode) {
      const demo = DEMO_PATIENTS[0];
      setMedications(demo.medications);
      setAppointments(demo.appointments);
      setAdherenceLogs([]);
      setCustomEduList([]);
      const demoNurse = {
        id: DEMO_NURSE.id,
        name: DEMO_NURSE.nurse_profile.professional_title || DEMO_NURSE.full_name,
        roleLabel: 'Perawat Penanggung Jawab',
      };
      setAssignedNurses([demoNurse]);
      setSelectedNurseId((prev) => prev || demoNurse.id);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    try {
      const [medsRes, logsRes, apptsRes, relRes, eduRes] = await Promise.all([
        supabase
          .from('patient_medications')
          .select('*')
          .eq('patient_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('medication_adherence_logs')
          .select('*, medication:patient_medications(medication_name, dosage)')
          .eq('patient_id', user.id)
          .order('scheduled_time', { ascending: false })
          .limit(50),
        supabase
          .from('patient_appointments')
          .select('*')
          .eq('patient_id', user.id)
          .order('appointment_date', { ascending: true }),
        supabase.rpc('get_my_nurse_patient_relationships'),
        supabase
          .from('patient_education_assignments')
          .select('*')
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      const queryErr = medsRes.error || logsRes.error || apptsRes.error || eduRes.error;
      if (queryErr) {
        setFetchError(`Sebagian data perawatan gagal dimuat: ${queryErr.message}`);
      }

      setMedications((medsRes.data as PatientMedication[]) || []);
      setAdherenceLogs((logsRes.data as AdherenceWithMed[]) || []);
      setAppointments((apptsRes.data as PatientAppointment[]) || []);
      setCustomEduList((eduRes.data as PatientEducationAssignment[]) || []);

      let activeNurseList: Array<{ id: string; name: string; title?: string; roleLabel?: string }> = [];

      if (!relRes.error && Array.isArray(relRes.data)) {
        activeNurseList = (relRes.data as RelationshipSummary[])
          .filter((r) => r.is_active && r.status === 'active' && !r.ended_at)
          .map((r) => ({
            id: r.nurse_id,
            name: r.professional_title || r.counterpart_name || 'Perawat',
            title: r.hospital_name || undefined,
            roleLabel:
              r.relationship_role === 'perawat_pendamping'
                ? 'Perawat Pendamping'
                : 'Perawat Penanggung Jawab',
          }));
      } else {
        if (relRes.error) {
          if (isMissingRpcError(relRes.error)) {
            setRpcNotice(
              'Fungsi backend tim multi-perawat (`004_live_sync_consent_rpcs_and_mvp.sql`) belum diterapkan di Supabase. Pesan menggunakan perawat aktif terverifikasi.'
            );
          } else {
            setFetchError((prev) => prev || `Sebagian data tim perawat gagal dimuat: ${relRes.error.message}`);
          }
        }
        const { data: assignList, error: assignErr } = await supabase
          .from('patient_nurse_assignments')
          .select('nurse_id, relationship_role')
          .eq('patient_id', user.id)
          .eq('is_active', true)
          .eq('status', 'active')
          .is('ended_at', null);

        if (assignErr) {
          setFetchError((prev) => prev || `Gagal memuat daftar perawat aktif: ${assignErr.message}`);
        } else if (assignList && assignList.length > 0) {
          const ids = assignList.map((a: any) => a.nurse_id);
          const [{ data: nProfs }, { data: nDets }] = await Promise.all([
            supabase.from('profiles').select('id, full_name').in('id', ids),
            supabase.from('nurse_profiles').select('id, professional_title, hospital_name').in('id', ids),
          ]);
          const profMap = new Map((nProfs || []).map((p: any) => [p.id, p]));
          const detMap = new Map((nDets || []).map((d: any) => [d.id, d]));

          activeNurseList = assignList.map((a: any) => {
            const p = profMap.get(a.nurse_id);
            const d = detMap.get(a.nurse_id);
            return {
              id: a.nurse_id,
              name: d?.professional_title || p?.full_name || 'Perawat Penanggung Jawab',
              title: d?.hospital_name || undefined,
              roleLabel:
                a.relationship_role === 'perawat_pendamping'
                  ? 'Perawat Pendamping'
                  : 'Perawat Penanggung Jawab',
            };
          });
        }
      }

      setAssignedNurses(activeNurseList);
      setSelectedNurseId((prev) =>
        activeNurseList.some((n) => n.id === prev) ? prev : activeNurseList[0]?.id || ''
      );
    } catch (err: any) {
      console.error('Error loading care data:', err);
      setFetchError(err?.message || 'Gagal memuat data perawatan.');
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    loadCareData();
  }, [loadCareData]);

  useRealtimeSubscription(
    `patient-care-${user?.id || 'anon'}`,
    user && !isDemoMode
      ? [
          { table: 'patient_medications', filter: `patient_id=eq.${user.id}` },
          { table: 'medication_adherence_logs', filter: `patient_id=eq.${user.id}` },
          { table: 'patient_appointments', filter: `patient_id=eq.${user.id}` },
          { table: 'patient_education_assignments', filter: `patient_id=eq.${user.id}` },
          { table: 'patient_nurse_assignments', filter: `patient_id=eq.${user.id}` },
        ]
      : [],
    loadCareData,
    Boolean(user && !isDemoMode)
  );

  const handleLogAdherence = async (med: PatientMedication, status: AdherenceStatus) => {
    if (!user || submittingLog) return;
    setFeedback(null);
    const now = new Date().toISOString();

    if (isDemoMode) {
      setAdherenceLogs((prev) => [
        {
          id: `demo-adh-${Date.now()}`,
          medication_id: med.id,
          patient_id: user.id,
          scheduled_time: now,
          taken_time: status !== 'tidak_diminum' ? now : undefined,
          status,
          notes: logNotes.trim() || undefined,
          medication: { medication_name: med.medication_name, dosage: med.dosage },
        },
        ...prev,
      ]);
      setLoggingMedId(null);
      setLogNotes('');
      setFeedback({ type: 'success', text: `Kepatuhan obat ${med.medication_name} dicatat (Demo).` });
      return;
    }

    setSubmittingLog(true);
    const supabase = getSupabase();
    try {
      const { error } = await supabase.from('medication_adherence_logs').insert({
        medication_id: med.id,
        patient_id: user.id,
        scheduled_time: now,
        taken_time: status === 'diminum' || status === 'terlambat' ? now : null,
        status,
        notes: logNotes.trim() || null,
      });

      if (error) {
        setFeedback({ type: 'error', text: `Gagal mencatat kepatuhan obat: ${error.message}` });
        return;
      }

      const statusLabel =
        status === 'diminum'
          ? 'Sudah Diminum'
          : status === 'terlambat'
          ? 'Diminum Terlambat'
          : 'Tidak Diminum';

      await notifyAssignedNurses(user.id, {
        title:
          status === 'tidak_diminum'
            ? `Obat Tidak Diminum (${profile?.full_name || 'Pasien'})`
            : `Catatan Obat: ${med.medication_name}`,
        message: `${profile?.full_name || 'Pasien'} mencatat status "${statusLabel}" untuk ${med.medication_name} (${med.dosage}).`,
        type: 'medication',
        linkTarget: `patient:${user.id}:obat`,
      });

      setLoggingMedId(null);
      setLogNotes('');
      setFeedback({ type: 'success', text: `Status minum ${med.medication_name} berhasil disimpan.` });
      await loadCareData();
    } finally {
      setSubmittingLog(false);
    }
  };

  const handleMarkEduRead = async (eduId: string) => {
    if (isDemoMode || !user || markingEduId === eduId) return;
    setMarkingEduId(eduId);
    const supabase = getSupabase();
    try {
      const { error } = await supabase
        .from('patient_education_assignments')
        .update({ is_read: true })
        .eq('id', eduId)
        .eq('patient_id', user.id);
      if (error) {
        setFeedback({ type: 'error', text: `Gagal menandai edukasi telah dibaca: ${error.message}` });
        return;
      }
      setCustomEduList((prev) =>
        prev.map((item) => (item.id === eduId ? { ...item, is_read: true } : item))
      );
    } finally {
      setMarkingEduId(null);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Rencana Perawatan Mandiri di Rumah
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola kepatuhan minum obat, pantau jadwal kontrol dokter, baca edukasi perawat, dan
            hubungi perawat Anda.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCareData}
          className="self-start sm:self-center p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
          title="Muat ulang data perawatan"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {rpcNotice && (
        <div className="p-3 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{rpcNotice}</span>
        </div>
      )}

      {fetchError && (
        <div className="p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={loadCareData}
            className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold shrink-0"
          >
            Muat Ulang
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-4 rounded-t-xl gap-2 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('obat')}
          className={`py-3.5 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'obat'
              ? 'border-teal-600 text-teal-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Jadwal & Kepatuhan Obat</span>
        </button>

        <button
          onClick={() => setActiveSubTab('kontrol')}
          className={`py-3.5 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'kontrol'
              ? 'border-teal-600 text-teal-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Jadwal Kontrol</span>
        </button>

        <button
          onClick={() => setActiveSubTab('edukasi')}
          className={`py-3.5 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'edukasi'
              ? 'border-teal-600 text-teal-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>
            Edukasi{' '}
            {customEduList.filter((e) => !e.is_read).length > 0 &&
              `(${customEduList.filter((e) => !e.is_read).length} Baru)`}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('pesan')}
          className={`py-3.5 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'pesan'
              ? 'border-teal-600 text-teal-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Pesan Perawat</span>
        </button>
      </div>

      {/* SUBTAB 1: OBAT & KEPATUHAN */}
      {activeSubTab === 'obat' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                Resep Obat Pascaoperasi dari Dokter & Perawat
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pastikan mengonsumsi obat sesuai instruksi. Klik tombol untuk mencatat saat Anda
                meminum obat.
              </p>
            </div>

            {medications.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                Belum ada obat aktif yang dimasukkan oleh perawat Anda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {medications.map((m) => {
                  const isLogging = loggingMedId === m.id;
                  return (
                    <div key={m.id} className="p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">
                            {m.medication_name}
                          </span>
                          <div className="text-slate-600 font-medium text-xs mt-0.5">
                            Dosis: <strong className="text-slate-900">{m.dosage}</strong> ·
                            Frekuensi: <strong className="text-slate-900">{m.frequency}</strong>
                          </div>
                          {m.instructions && (
                            <p className="text-[11px] text-teal-800 bg-teal-50 px-2.5 py-1 rounded mt-1.5 inline-block">
                              Petunjuk: {m.instructions}
                            </p>
                          )}
                        </div>

                        {!isLogging && (
                          <button
                            onClick={() => {
                              setLoggingMedId(m.id);
                              setLogNotes('');
                            }}
                            className="self-start sm:self-center px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                          >
                            Catat Minum Obat
                          </button>
                        )}
                      </div>

                      {isLogging && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                          <span className="font-semibold text-slate-800 block">
                            Pilih Status Konsumsi Obat {m.medication_name}:
                          </span>

                          <input
                            type="text"
                            value={logNotes}
                            onChange={(e) => setLogNotes(e.target.value)}
                            placeholder="Catatan tambahan (misal: sesudah makan siang)..."
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs"
                          />

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              disabled={submittingLog}
                              onClick={() => handleLogAdherence(m, 'diminum')}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sudah Diminum Tepat Waktu</span>
                            </button>

                            <button
                              disabled={submittingLog}
                              onClick={() => handleLogAdherence(m, 'terlambat')}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>Diminum Terlambat</span>
                            </button>

                            <button
                              disabled={submittingLog}
                              onClick={() => handleLogAdherence(m, 'tidak_diminum')}
                              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Tidak Diminum</span>
                            </button>

                            <button
                              onClick={() => setLoggingMedId(null)}
                              className="px-3 py-1.5 text-slate-500 hover:text-slate-700 ml-auto"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Adherence History */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-900">
              Riwayat Kepatuhan Minum Obat Anda
            </div>

            {adherenceLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada catatan kepatuhan yang terekam.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {adherenceLogs.map((log) => (
                  <div key={log.id} className="p-3.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-900">
                        {log.medication?.medication_name
                          ? `${log.medication.medication_name} (${log.medication.dosage})`
                          : 'Obat Terjadwal'}
                      </span>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Waktu: {new Date(log.scheduled_time).toLocaleString('id-ID')}
                        {log.notes && ` · Catatan: ${log.notes}`}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase shrink-0 ${
                        log.status === 'diminum'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.status === 'terlambat'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {log.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: JADWAL KONTROL */}
      {activeSubTab === 'kontrol' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Jadwal Kunjungan Kontrol ke Rumah Sakit
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Jadwal kontrol penting untuk evaluasi jahitan luka dan perkembangan pemulihan bedah.
            </p>
          </div>

          {appointments.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              Belum ada jadwal kontrol yang dijadwalkan oleh perawat Anda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {appointments.map((a) => (
                <div key={a.id} className="p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-teal-600" />
                      <span className="font-bold text-slate-900 text-sm">
                        {formatLocalDate(a.appointment_date, {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                      {a.appointment_time && (
                        <span className="text-slate-600 font-semibold">
                          Pukul {a.appointment_time} WIB
                        </span>
                      )}
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase self-start sm:self-center ${
                        a.status === 'terjadwal'
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : a.status === 'selesai'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>

                  <div className="text-slate-700">
                    <strong>Lokasi:</strong> {a.location}{' '}
                    {a.doctor_name && `· Dokter: ${a.doctor_name}`}
                  </div>

                  {a.notes && (
                    <div className="bg-slate-50 p-2.5 rounded-lg text-slate-600 text-[11px]">
                      <strong>Catatan Petunjuk:</strong> {a.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: EDUKASI PASCAOPERASI */}
      {activeSubTab === 'edukasi' && (
        <div className="space-y-6">
          {/* Custom Nurse Education Assignments */}
          {customEduList.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-teal-200 p-5 space-y-3">
              <h2 className="font-bold text-xs uppercase tracking-wider text-teal-800">
                Instruksi & Edukasi Khusus dari Perawat Anda
              </h2>
              <div className="space-y-3 text-xs">
                {customEduList.map((edu) => (
                  <div
                    key={edu.id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      edu.is_read
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-teal-50/60 border-teal-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-teal-700">
                          {edu.category.replace('_', ' ')}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900">{edu.title}</h3>
                      </div>
                      {edu.is_read ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Sudah Dibaca
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarkEduRead(edu.id)}
                          className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-semibold"
                        >
                          Tandai Dibaca
                        </button>
                      )}
                    </div>
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {edu.content}
                    </p>
                    <span className="block text-[10px] text-slate-400">
                      Dikirim {new Date(edu.created_at).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Surgery Selector */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-700">
              Pilih Jenis Operasi untuk Membaca Panduan Standar:
            </span>
            <select
              value={selectedEdu.id}
              onChange={(e) => {
                const found = SURGERY_EDUCATION_DATA.find((edu) => edu.id === e.target.value);
                if (found) setSelectedEdu(found);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-teal-900"
            >
              {SURGERY_EDUCATION_DATA.map((edu) => (
                <option key={edu.id} value={edu.id}>
                  {edu.surgery_name}
                </option>
              ))}
            </select>
          </div>

          {/* Standard Education Content View */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6 text-xs text-slate-700 leading-relaxed">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                Panduan Edukasi Resmi Keperawatan
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedEdu.surgery_name}</h2>
              <p className="text-slate-500 mt-1">{selectedEdu.short_summary}</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-teal-800">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>1. Perawatan Luka Jahitan Operasi</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {selectedEdu.wound_care.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-teal-800">
                <HeartPulse className="w-4 h-4 text-teal-600" />
                <span>2. Aktivitas & Mobilisasi Bertahap</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {selectedEdu.activity_mobilization.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-teal-800">
                <ShowerHead className="w-4 h-4 text-teal-600" />
                <span>3. Kebersihan Diri & Mandi</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {selectedEdu.hygiene.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-teal-800">
                <Apple className="w-4 h-4 text-teal-600" />
                <span>4. Pola Makan & Nutrisi Penyembuhan</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {selectedEdu.nutrition.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-teal-800">
                <Pill className="w-4 h-4 text-teal-600" />
                <span>5. Penggunaan Obat-obatan</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {selectedEdu.medications.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <h3 className="font-bold text-rose-900 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>6. Tanda Bahaya yang Memerlukan Respons Medis Segera</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-rose-800 font-medium">
                {selectedEdu.danger_signs.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-teal-800">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>7. Waktu Kontrol & Konsultasi</span>
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                {selectedEdu.follow_up.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: PESAN PERAWAT */}
      {activeSubTab === 'pesan' && (
        <div className="space-y-4">
          {assignedNurses.length > 0 && user ? (
            <>
              {assignedNurses.length > 1 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <Users className="w-4 h-4 text-teal-600" />
                    <span>Pilih Perawat Tujuan Percakapan ({assignedNurses.length} Aktif):</span>
                  </div>
                  <select
                    value={selectedNurseId}
                    onChange={(e) => setSelectedNurseId(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-teal-900"
                  >
                    {assignedNurses.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.roleLabel || 'Perawat'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(() => {
                const activeNurse =
                  assignedNurses.find((n) => n.id === selectedNurseId) || assignedNurses[0];
                return (
                  <PatientNurseChat
                    key={activeNurse.id}
                    patientId={user.id}
                    nurseId={activeNurse.id}
                    currentUserId={user.id}
                    currentUserRole="patient"
                    currentUserName={profile?.full_name || 'Pasien'}
                    counterpartName={activeNurse.name}
                    isDemoMode={isDemoMode}
                  />
                );
              })()}
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-2 text-xs">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-800">Belum Ada Perawat Terhubung</p>
              <p className="text-slate-500 max-w-md mx-auto">
                Fitur pesan langsung aktif setelah akun Anda terhubung dengan perawat penanggung
                jawab melalui undangan pasien atau persetujuan tim perawat di menu Profil.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
