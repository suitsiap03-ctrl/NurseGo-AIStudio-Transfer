/**
 * Comprehensive Patient Detail & Nursing Management for NurseGo
 *
 * Sub-sections:
 * 1. Hasil Monitoring (Tanda vital, Skala nyeri, Gejala & Kondisi Umum, Kondisi luka)
 * 2. Grafik Tren (Recharts interactive)
 * 3. Peringatan Klinis (Triage & tindak lanjut + notifikasi ke pasien)
 * 4. Dokumentasi Asuhan Keperawatan (Tambah & Edit 6-langkah SOAP)
 * 5. Obat & Kepatuhan (Tambah, Edit, Nonaktifkan/Aktifkan, Hapus + notifikasi ke pasien)
 * 6. Jadwal Kontrol (Tambah, Ubah Status, Hapus + notifikasi ke pasien)
 * 7. Edukasi Pasien (Catatan edukasi khusus dari perawat)
 * 8. Pesan (Chat real-time perawat <-> pasien)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { createNotification } from '../../lib/notifications';
import { formatLocalDate, parseLocalDate } from '../../lib/dateUtils';
import {
  ArrowLeft,
  HeartPulse,
  AlertTriangle,
  FileText,
  Pill,
  Calendar,
  CheckCircle2,
  Plus,
  RefreshCw,
  Activity,
  LineChart,
  MessageSquare,
  BookOpen,
  Trash2,
  Edit3,
  Power,
  UserX,
} from 'lucide-react';
import { MetricChartsView } from '../common/Charts';
import { PatientNurseChat } from '../common/PatientNurseChat';
import { DEMO_PATIENTS } from '../../data/mockData';
import {
  Profile,
  PatientProfile,
  PatientSurgery,
  VitalSignRecord,
  PainRecord,
  SymptomRecord,
  WoundRecord,
  PatientAlert,
  NursingCarePlan,
  PatientMedication,
  MedicationAdherenceLog,
  PatientAppointment,
  PatientEducationAssignment,
  RelationshipSummary,
} from '../../types/database';

type DetailTab =
  | 'monitoring'
  | 'grafik'
  | 'peringatan'
  | 'dokumentasi'
  | 'obat'
  | 'kontrol'
  | 'edukasi'
  | 'pesan';

interface PatientDetailProps {
  patientId: string;
  onBack: () => void;
  initialTab?: string;
}

export const PatientDetail: React.FC<PatientDetailProps> = ({
  patientId,
  onBack,
  initialTab,
}) => {
  const { user, profile: currentNurseProfile, isDemoMode } = useAuth();
  const [activeTab, setActiveTab] = useState<DetailTab>('monitoring');
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Patient Core Data
  const [profile, setProfile] = useState<Profile | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [surgery, setSurgery] = useState<PatientSurgery | null>(null);

  // Monitoring records
  const [vitals, setVitals] = useState<VitalSignRecord[]>([]);
  const [painRecords, setPainRecords] = useState<PainRecord[]>([]);
  const [symptomRecords, setSymptomRecords] = useState<SymptomRecord[]>([]);
  const [woundRecords, setWoundRecords] = useState<WoundRecord[]>([]);

  // Alerts
  const [alerts, setAlerts] = useState<PatientAlert[]>([]);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<string>('');

  // Relationship management
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [relationshipRole, setRelationshipRole] = useState<string>('perawat_penanggung_jawab');
  const [confirmEndRel, setConfirmEndRel] = useState<boolean>(false);
  const [endingRel, setEndingRel] = useState<boolean>(false);

  // Nursing Care Plans (Create + Edit)
  const [carePlans, setCarePlans] = useState<NursingCarePlan[]>([]);
  const [isAddingCarePlan, setIsAddingCarePlan] = useState<boolean>(false);
  const [editingCarePlanId, setEditingCarePlanId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState('');
  const [subjectiveData, setSubjectiveData] = useState('');
  const [objectiveData, setObjectiveData] = useState('');
  const [nursingDiagnosis, setNursingDiagnosis] = useState('');
  const [goalsOutcomes, setGoalsOutcomes] = useState('');
  const [interventions, setInterventions] = useState('');
  const [implementation, setImplementation] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [submittingCarePlan, setSubmittingCarePlan] = useState(false);

  // Medications (Create + Edit)
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [adherenceLogs, setAdherenceLogs] = useState<MedicationAdherenceLog[]>([]);
  const [isAddingMed, setIsAddingMed] = useState<boolean>(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [confirmDeleteMedId, setConfirmDeleteMedId] = useState<string | null>(null);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medFrequency, setMedFrequency] = useState('3x1 sehari sesudah makan');
  const [medInstructions, setMedInstructions] = useState('');
  const [savingMed, setSavingMed] = useState(false);

  // Appointments (Create + Edit)
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [isAddingAppt, setIsAddingAppt] = useState<boolean>(false);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('09:00');
  const [apptLocation, setApptLocation] = useState('Poliklinik Bedah');
  const [apptDoctor, setApptDoctor] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  // Custom Education Assignments
  const [educationNotes, setEducationNotes] = useState<PatientEducationAssignment[]>([]);
  const [isAddingEdu, setIsAddingEdu] = useState<boolean>(false);
  const [confirmDeleteEduId, setConfirmDeleteEduId] = useState<string | null>(null);
  const [eduTitle, setEduTitle] = useState('');
  const [eduCategory, setEduCategory] = useState('perawatan_luka');
  const [eduContent, setEduContent] = useState('');
  const [savingEdu, setSavingEdu] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!initialTab) return;
    const map: Record<string, DetailTab> = {
      overview: 'monitoring',
      monitoring: 'monitoring',
      grafik: 'grafik',
      peringatan: 'peringatan',
      dokumentasi: 'dokumentasi',
      obat: 'obat',
      kontrol: 'kontrol',
      edukasi: 'edukasi',
      messages: 'pesan',
      pesan: 'pesan',
    };
    if (map[initialTab]) setActiveTab(map[initialTab]);
  }, [initialTab]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const loadAllPatientData = useCallback(async () => {
    if (isDemoMode) {
      const demo = DEMO_PATIENTS.find((d) => d.profile.id === patientId) || DEMO_PATIENTS[0];
      setProfile(demo.profile);
      setPatientProfile(demo.patient_profile);
      setSurgery(demo.surgery);
      setVitals(demo.historicalVitals);
      setPainRecords(demo.historicalPain);
      setWoundRecords([demo.latestWound]);
      setSymptomRecords([demo.latestSymptoms]);
      setAlerts(demo.activeAlerts);
      setCarePlans(demo.carePlans);
      setMedications(demo.medications);
      setAppointments(demo.appointments);
      setAdherenceLogs([]);
      setEducationNotes([]);
      setAssignmentId(null);
      setConfirmEndRel(false);
      setResolvingAlertId(null);
      setFeedback(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = getSupabase();

    try {
      const [
        profRes,
        pProfRes,
        surgRes,
        vRes,
        pRes,
        sRes,
        wRes,
        aRes,
        cpRes,
        mRes,
        adhRes,
        apptRes,
        eduRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', patientId).maybeSingle(),
        supabase.from('patient_profiles').select('*').eq('id', patientId).maybeSingle(),
        supabase
          .from('patient_surgeries')
          .select('*, surgery_type:surgery_types(*)')
          .eq('patient_id', patientId)
          .order('surgery_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('vital_sign_records').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }),
        supabase.from('pain_records').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }),
        supabase.from('symptom_records').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }),
        supabase.from('wound_records').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }),
        supabase.from('patient_alerts').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('nursing_care_plans').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase.from('patient_medications').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
        supabase
          .from('medication_adherence_logs')
          .select('*, medication:patient_medications(*)')
          .eq('patient_id', patientId)
          .order('scheduled_time', { ascending: false }),
        supabase.from('patient_appointments').select('*').eq('patient_id', patientId).order('appointment_date', { ascending: true }),
        supabase.from('patient_education_assignments').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      ]);

      const queryErr =
        profRes.error ||
        pProfRes.error ||
        surgRes.error ||
        vRes.error ||
        pRes.error ||
        sRes.error ||
        wRes.error ||
        aRes.error ||
        cpRes.error ||
        mRes.error ||
        adhRes.error ||
        apptRes.error ||
        eduRes.error;

      if (queryErr) {
        showToast('error', `Sebagian data detail pasien gagal dimuat: ${queryErr.message}`);
      }

      if (profRes.data) setProfile(profRes.data);
      if (pProfRes.data) setPatientProfile(pProfRes.data);
      if (surgRes.data) setSurgery(surgRes.data);
      setVitals(vRes.data || []);
      setPainRecords(pRes.data || []);
      setSymptomRecords(sRes.data || []);
      setWoundRecords(wRes.data || []);
      setAlerts(aRes.data || []);
      setCarePlans(cpRes.data || []);
      setMedications(mRes.data || []);
      setAdherenceLogs(adhRes.data || []);
      setAppointments(apptRes.data || []);
      setEducationNotes((eduRes.data as PatientEducationAssignment[]) || []);

      if (user) {
        const { data: relData, error: relErr } = await supabase.rpc(
          'get_my_nurse_patient_relationships'
        );
        if (!relErr && Array.isArray(relData)) {
          const match = (relData as RelationshipSummary[]).find(
            (r) =>
              r.patient_id === patientId &&
              r.nurse_id === user.id &&
              r.is_active &&
              r.status === 'active' &&
              !r.ended_at
          );
          setAssignmentId(match?.id || null);
          setRelationshipRole(match?.relationship_role || 'perawat_penanggung_jawab');
        } else {
          const { data: assignRow } = await supabase
            .from('patient_nurse_assignments')
            .select('id, relationship_role')
            .eq('patient_id', patientId)
            .eq('nurse_id', user.id)
            .eq('is_active', true)
            .eq('status', 'active')
            .is('ended_at', null)
            .maybeSingle();
          setAssignmentId(assignRow?.id || null);
          setRelationshipRole(assignRow?.relationship_role || 'perawat_penanggung_jawab');
        }
      }
    } catch (err: any) {
      showToast('error', err.message || 'Gagal memuat data detail pasien.');
    } finally {
      setLoading(false);
    }
  }, [patientId, isDemoMode, user]);

  useEffect(() => {
    loadAllPatientData();
  }, [loadAllPatientData]);

  useRealtimeSubscription(
    `patient-detail-${patientId}`,
    [
      { table: 'profiles', filter: `id=eq.${patientId}` },
      { table: 'patient_profiles', filter: `id=eq.${patientId}` },
      { table: 'patient_surgeries', filter: `patient_id=eq.${patientId}` },
      { table: 'vital_sign_records', filter: `patient_id=eq.${patientId}` },
      { table: 'pain_records', filter: `patient_id=eq.${patientId}` },
      { table: 'symptom_records', filter: `patient_id=eq.${patientId}` },
      { table: 'wound_records', filter: `patient_id=eq.${patientId}` },
      { table: 'patient_alerts', filter: `patient_id=eq.${patientId}` },
      { table: 'nursing_care_plans', filter: `patient_id=eq.${patientId}` },
      { table: 'patient_medications', filter: `patient_id=eq.${patientId}` },
      { table: 'medication_adherence_logs', filter: `patient_id=eq.${patientId}` },
      { table: 'patient_appointments', filter: `patient_id=eq.${patientId}` },
      { table: 'patient_education_assignments', filter: `patient_id=eq.${patientId}` },
      { table: 'patient_nurse_assignments', filter: `patient_id=eq.${patientId}` },
      { table: 'patient_messages', filter: `patient_id=eq.${patientId}` },
    ],
    loadAllPatientData,
    Boolean(patientId && !isDemoMode)
  );

  const handleResolveAlert = async (alertId: string, newStatus: 'ditinjau' | 'selesai') => {
    const lockKey = `alert:${alertId}`;
    if (!user || isDemoMode || busyActionKey === lockKey) return;
    setBusyActionKey(lockKey);
    const supabase = getSupabase();
    try {
      const notes = resolutionNotes.trim() || `Ditindaklanjuti oleh perawat pada ${new Date().toLocaleString('id-ID')}`;
      const { error } = await supabase
        .from('patient_alerts')
        .update({
          status: newStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: notes,
        })
        .eq('id', alertId);

      if (error) {
        showToast('error', `Gagal memperbarui status peringatan: ${error.message}`);
        return;
      }

      await supabase
        .from('patient_alert_events')
        .insert({
          alert_id: alertId,
          event_type: newStatus === 'selesai' ? 'alert_resolved' : 'alert_reviewed',
          notes,
          created_by: user.id,
        })
        .then(({ error: evtErr }) => {
          if (evtErr) console.warn('Alert event log notice:', evtErr.message);
        });

      await createNotification({
        userId: patientId,
        role: 'patient',
        title: `Peringatan Klinis ${newStatus === 'selesai' ? 'Diselesaikan' : 'Sedang Ditinjau'}`,
        message: notes,
        type: 'alert',
        linkTarget: 'tab:beranda',
      });

      setResolvingAlertId(null);
      setResolutionNotes('');
      showToast('success', 'Status peringatan berhasil diperbarui dan pasien diberi notifikasi.');
      loadAllPatientData();
    } finally {
      setBusyActionKey(null);
    }
  };

  const resetCarePlanForm = () => {
    setIsAddingCarePlan(false);
    setEditingCarePlanId(null);
    setAssessment('');
    setSubjectiveData('');
    setObjectiveData('');
    setNursingDiagnosis('');
    setGoalsOutcomes('');
    setInterventions('');
    setImplementation('');
    setEvaluation('');
  };

  const startEditCarePlan = (cp: NursingCarePlan) => {
    setEditingCarePlanId(cp.id);
    setAssessment(cp.assessment || '');
    setSubjectiveData(cp.subjective_data || '');
    setObjectiveData(cp.objective_data || '');
    setNursingDiagnosis(cp.nursing_diagnosis || '');
    setGoalsOutcomes(cp.goals_outcomes || '');
    setInterventions(cp.interventions || '');
    setImplementation(cp.implementation || '');
    setEvaluation(cp.evaluation || '');
    setIsAddingCarePlan(true);
  };

  const handleSaveCarePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      showToast('error', 'Mode Demo bersifat baca-saja. Gunakan akun Perawat aktif untuk menyimpan dokumentasi.');
      return;
    }
    if (!user || submittingCarePlan) return;
    if (!assessment.trim() || !nursingDiagnosis.trim()) return;

    setSubmittingCarePlan(true);
    const supabase = getSupabase();
    try {
      const sTrim = subjectiveData.trim();
      const oTrim = objectiveData.trim();
      const aTrim = assessment.trim();

      if (editingCarePlanId) {
        const updatePayload = {
          assessment: aTrim,
          subjective_data: sTrim || null,
          objective_data: oTrim || null,
          nursing_diagnosis: nursingDiagnosis.trim(),
          goals_outcomes: goalsOutcomes.trim(),
          interventions: interventions.trim(),
          implementation: implementation.trim(),
          evaluation: evaluation.trim(),
          updated_at: new Date().toISOString(),
        };
        let { error } = await supabase
          .from('nursing_care_plans')
          .update(updatePayload)
          .eq('id', editingCarePlanId);

        if (
          error &&
          (error.message.includes('subjective_data') ||
            error.message.includes('objective_data') ||
            error.code === 'PGRST204' ||
            error.code === '42703')
        ) {
          const combinedAssessment = [sTrim ? `S: ${sTrim}` : '', oTrim ? `O: ${oTrim}` : '', `A: ${aTrim}`]
            .filter(Boolean)
            .join('\n');
          const { subjective_data: _s, objective_data: _o, ...legacyUpdate } = updatePayload;
          const retry = await supabase
            .from('nursing_care_plans')
            .update({ ...legacyUpdate, assessment: combinedAssessment })
            .eq('id', editingCarePlanId);
          error = retry.error;
        }
        if (error) throw error;
        showToast('success', 'Dokumentasi asuhan keperawatan diperbarui.');
      } else {
        const insertPayload = {
          patient_id: patientId,
          nurse_id: user.id,
          assessment: aTrim,
          subjective_data: sTrim || null,
          objective_data: oTrim || null,
          nursing_diagnosis: nursingDiagnosis.trim(),
          goals_outcomes: goalsOutcomes.trim(),
          interventions: interventions.trim(),
          implementation: implementation.trim(),
          evaluation: evaluation.trim(),
        };
        let { error } = await supabase.from('nursing_care_plans').insert(insertPayload);

        if (
          error &&
          (error.message.includes('subjective_data') ||
            error.message.includes('objective_data') ||
            error.code === 'PGRST204' ||
            error.code === '42703')
        ) {
          const combinedAssessment = [sTrim ? `S: ${sTrim}` : '', oTrim ? `O: ${oTrim}` : '', `A: ${aTrim}`]
            .filter(Boolean)
            .join('\n');
          const { subjective_data: _s, objective_data: _o, ...legacyInsert } = insertPayload;
          const retry = await supabase
            .from('nursing_care_plans')
            .insert({ ...legacyInsert, assessment: combinedAssessment });
          error = retry.error;
        }
        if (error) throw error;
        showToast('success', 'Dokumentasi asuhan keperawatan disimpan.');
      }
      resetCarePlanForm();
      loadAllPatientData();
    } catch (err: any) {
      showToast('error', `Gagal menyimpan dokumentasi: ${err.message}`);
    } finally {
      setSubmittingCarePlan(false);
    }
  };

  const resetMedForm = () => {
    setIsAddingMed(false);
    setEditingMedId(null);
    setMedName('');
    setMedDosage('');
    setMedFrequency('3x1 sehari sesudah makan');
    setMedInstructions('');
  };

  const startEditMed = (m: PatientMedication) => {
    setEditingMedId(m.id);
    setMedName(m.medication_name);
    setMedDosage(m.dosage);
    setMedFrequency(m.frequency);
    setMedInstructions(m.instructions || '');
    setIsAddingMed(true);
  };

  const handleSaveMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      showToast('error', 'Mode Demo bersifat baca-saja. Gunakan akun Perawat aktif untuk menyimpan resep obat.');
      return;
    }
    if (!medName.trim() || !medDosage.trim() || savingMed) return;
    setSavingMed(true);
    const supabase = getSupabase();
    try {
      if (editingMedId) {
        const { error } = await supabase
          .from('patient_medications')
          .update({
            medication_name: medName.trim(),
            dosage: medDosage.trim(),
            frequency: medFrequency.trim(),
            instructions: medInstructions.trim(),
          })
          .eq('id', editingMedId);
        if (error) throw error;
        showToast('success', 'Data obat berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('patient_medications').insert({
          patient_id: patientId,
          medication_name: medName.trim(),
          dosage: medDosage.trim(),
          frequency: medFrequency.trim(),
          instructions: medInstructions.trim(),
          is_active: true,
        });
        if (error) throw error;

        await createNotification({
          userId: patientId,
          role: 'patient',
          title: 'Resep / Jadwal Obat Baru',
          message: `Perawat menambahkan obat: ${medName.trim()} (${medDosage.trim()}, ${medFrequency.trim()}).`,
          type: 'medication',
          linkTarget: 'tab:perawatan:obat',
        });
        showToast('success', 'Resep obat disimpan & notifikasi dikirim ke pasien.');
      }
      resetMedForm();
      loadAllPatientData();
    } catch (err: any) {
      showToast('error', `Gagal menyimpan obat: ${err.message}`);
    } finally {
      setSavingMed(false);
    }
  };

  const handleToggleMedActive = async (m: PatientMedication) => {
    const lockKey = `med-toggle:${m.id}`;
    if (isDemoMode || busyActionKey === lockKey) return;
    setBusyActionKey(lockKey);
    const supabase = getSupabase();
    try {
      const { error } = await supabase
        .from('patient_medications')
        .update({ is_active: !m.is_active })
        .eq('id', m.id);
      if (error) {
        showToast('error', `Gagal mengubah status obat: ${error.message}`);
        return;
      }
      loadAllPatientData();
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleDeleteMed = async (medId: string) => {
    const lockKey = `med-del:${medId}`;
    if (isDemoMode || busyActionKey === lockKey) return;
    setBusyActionKey(lockKey);
    const supabase = getSupabase();
    try {
      const { error } = await supabase.from('patient_medications').delete().eq('id', medId);
      if (error) {
        showToast('error', `Gagal menghapus obat: ${error.message}`);
        return;
      }
      setConfirmDeleteMedId(null);
      showToast('success', 'Obat dihapus.');
      loadAllPatientData();
    } finally {
      setBusyActionKey(null);
    }
  };

  const resetApptForm = () => {
    setIsAddingAppt(false);
    setEditingApptId(null);
    setApptDate('');
    setApptTime('09:00');
    setApptLocation('Poliklinik Bedah');
    setApptDoctor('');
    setApptNotes('');
  };

  const startEditAppt = (a: PatientAppointment) => {
    setEditingApptId(a.id);
    setApptDate(a.appointment_date);
    setApptTime(a.appointment_time || '09:00');
    setApptLocation(a.location);
    setApptDoctor(a.doctor_name || '');
    setApptNotes(a.notes || '');
    setIsAddingAppt(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      showToast('error', 'Mode Demo bersifat baca-saja. Gunakan akun Perawat aktif untuk menyimpan jadwal kontrol.');
      return;
    }
    if (!apptDate || savingAppt) return;
    setSavingAppt(true);
    const supabase = getSupabase();
    try {
      if (editingApptId) {
        const { error } = await supabase
          .from('patient_appointments')
          .update({
            appointment_date: apptDate,
            appointment_time: apptTime,
            location: apptLocation.trim(),
            doctor_name: apptDoctor.trim(),
            notes: apptNotes.trim(),
          })
          .eq('id', editingApptId);
        if (error) throw error;
        showToast('success', 'Jadwal kontrol berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('patient_appointments').insert({
          patient_id: patientId,
          nurse_id: user?.id,
          appointment_date: apptDate,
          appointment_time: apptTime,
          location: apptLocation.trim(),
          doctor_name: apptDoctor.trim(),
          notes: apptNotes.trim(),
          status: 'terjadwal',
        });
        if (error) throw error;

        await createNotification({
          userId: patientId,
          role: 'patient',
          title: 'Jadwal Kontrol Baru',
          message: `Kontrol dijadwalkan pada ${formatLocalDate(apptDate)} pukul ${apptTime} di ${apptLocation}.`,
          type: 'appointment',
          linkTarget: 'tab:perawatan:kontrol',
        });
        showToast('success', 'Jadwal kontrol disimpan & pasien diberi notifikasi.');
      }
      resetApptForm();
      loadAllPatientData();
    } catch (err: any) {
      showToast('error', `Gagal menyimpan jadwal kontrol: ${err.message}`);
    } finally {
      setSavingAppt(false);
    }
  };

  const handleUpdateApptStatus = async (apptId: string, status: 'terjadwal' | 'selesai' | 'dibatalkan') => {
    const lockKey = `appt:${apptId}`;
    if (isDemoMode || busyActionKey === lockKey) return;
    setBusyActionKey(lockKey);
    const supabase = getSupabase();
    try {
      const { error } = await supabase.from('patient_appointments').update({ status }).eq('id', apptId);
      if (error) {
        showToast('error', `Gagal mengubah status kontrol: ${error.message}`);
        return;
      }
      loadAllPatientData();
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleAddEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      showToast('error', 'Mode Demo bersifat baca-saja. Gunakan akun Perawat aktif untuk mengirim edukasi.');
      return;
    }
    if (!user || !eduTitle.trim() || !eduContent.trim() || savingEdu) return;
    setSavingEdu(true);
    const supabase = getSupabase();
    try {
      const { error } = await supabase.from('patient_education_assignments').insert({
        patient_id: patientId,
        nurse_id: user.id,
        title: eduTitle.trim(),
        category: eduCategory,
        content: eduContent.trim(),
      });
      if (error) {
        showToast('error', `Gagal menyimpan edukasi pasien: ${error.message}`);
        return;
      }

      await createNotification({
        userId: patientId,
        role: 'patient',
        title: 'Materi Edukasi Baru dari Perawat',
        message: `${eduTitle.trim()}`,
        type: 'system',
        linkTarget: 'tab:perawatan:edukasi',
      });

      setIsAddingEdu(false);
      setEduTitle('');
      setEduContent('');
      showToast('success', 'Edukasi pasien dikirim dan pasien menerima notifikasi.');
      loadAllPatientData();
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal mengirim edukasi pasien.');
    } finally {
      setSavingEdu(false);
    }
  };

  const handleDeleteEducation = async (id: string) => {
    const lockKey = `edu-del:${id}`;
    if (isDemoMode || busyActionKey === lockKey) return;
    setBusyActionKey(lockKey);
    const supabase = getSupabase();
    try {
      const { error } = await supabase.from('patient_education_assignments').delete().eq('id', id);
      if (error) {
        showToast('error', `Gagal menghapus materi edukasi: ${error.message}`);
        return;
      }
      setConfirmDeleteEduId(null);
      showToast('success', 'Materi edukasi dihapus.');
      loadAllPatientData();
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleEndRelationship = async () => {
    if (isDemoMode || !assignmentId || !user) return;
    setEndingRel(true);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('end_nurse_patient_assignment', {
        p_assignment_id: assignmentId,
      });

      if (error) {
        if (!isMissingRpcError(error)) {
          throw new Error(error.message);
        }
        const { error: updErr } = await supabase
          .from('patient_nurse_assignments')
          .update({
            is_active: false,
            status: 'ended',
            ended_at: new Date().toISOString(),
          })
          .eq('id', assignmentId)
          .eq('nurse_id', user.id);
        if (updErr) {
          throw new Error(
            `Fungsi \`end_nurse_patient_assignment\` belum terpasang di Supabase dan pembaruan langsung ditolak (${updErr.message}). Jalankan migrasi \`004_live_sync_consent_rpcs_and_mvp.sql\`.`
          );
        }
      } else if (data && !data.success) {
        throw new Error(data.reason || 'Gagal mengakhiri hubungan pemantauan.');
      }

      onBack();
    } catch (err: any) {
      showToast('error', err.message || 'Gagal mengakhiri hubungan pemantauan.');
    } finally {
      setEndingRel(false);
    }
  };

  let patientAge = '-';
  const parsedDob = parseLocalDate(patientProfile?.date_of_birth);
  if (parsedDob) {
    patientAge = `${new Date().getFullYear() - parsedDob.getFullYear()} Tahun`;
  }

  const activeAlerts = alerts.filter((a) => a.status === 'aktif');

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Pasien</span>
        </button>

        <button
          onClick={() => loadAllPatientData()}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="Muat ulang data pasien"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {!loading && !profile && (
        <div className="bg-white rounded-xl border border-rose-200 p-6 text-center space-y-3 text-xs">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <div className="font-bold text-slate-900 text-sm">
            Data Pasien Tidak Dapat Diakses atau Tidak Ditemukan
          </div>
          <p className="text-slate-600 max-w-md mx-auto">
            Pastikan pasien masih terhubung aktif dengan akun Anda atau coba muat ulang halaman.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold"
          >
            Kembali ke Daftar Pasien
          </button>
        </div>
      )}

      {/* Patient Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold text-lg shrink-0">
              {profile?.full_name ? profile.full_name[0].toUpperCase() : 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900">
                  {profile?.full_name || 'Nama Pasien'}
                </h1>
                {activeAlerts.length > 0 ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{activeAlerts.length} Peringatan Aktif</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Kondisi Terpantau Stabil</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                <span>{profile?.email}</span>
                <span>·</span>
                <span>{patientAge}</span>
                <span>·</span>
                <span>JK: {patientProfile?.gender || '-'}</span>
                {profile?.phone && <span>· Telp: {profile.phone}</span>}
              </div>
              {patientProfile?.emergency_contact_name && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Kontak Darurat: <strong>{patientProfile.emergency_contact_name}</strong> ({patientProfile.emergency_contact_phone || '-'})
                </div>
              )}
              {(patientProfile?.allergies || patientProfile?.medical_history || patientProfile?.address) && (
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {patientProfile?.allergies && (
                    <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                      Alergi: {patientProfile.allergies}
                    </span>
                  )}
                  {patientProfile?.medical_history && (
                    <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900">
                      Riwayat Medis: {patientProfile.medical_history}
                    </span>
                  )}
                  {patientProfile?.address && (
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      Alamat: {patientProfile.address}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 text-xs min-w-[230px]">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Tindakan Bedah
            </div>
            <div className="font-bold text-teal-800 text-sm mt-0.5">
              {surgery?.surgery_type?.name || 'Pasca Operasi Bedah'}
            </div>
            <div className="text-[11px] text-slate-600 mt-1 space-y-0.5 tabular-nums">
              <div>Tanggal Operasi: {surgery?.surgery_date ? formatLocalDate(surgery.surgery_date) : '-'}</div>
              <div>Tanggal Pulang: {surgery?.discharge_date ? formatLocalDate(surgery.discharge_date) : '-'}</div>
              {surgery?.surgeon_name && <div>Operator: {surgery.surgeon_name}</div>}
            </div>
          </div>
        </div>

        {!isDemoMode && assignmentId && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-slate-600">
              Peran Anda:{' '}
              <strong className="text-teal-800">
                {relationshipRole === 'perawat_pendamping'
                  ? 'Perawat Pendamping'
                  : 'Perawat Penanggung Jawab'}
              </strong>
            </span>
            {confirmEndRel ? (
              <div className="flex items-center gap-2">
                <span className="text-rose-700 font-medium">Akhiri pemantauan pasien ini?</span>
                <button
                  type="button"
                  disabled={endingRel}
                  onClick={handleEndRelationship}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-[11px] disabled:opacity-50"
                >
                  {endingRel ? 'Memproses...' : 'Ya, Akhiri'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEndRel(false)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-[11px]"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmEndRel(true)}
                className="self-start sm:self-center px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold inline-flex items-center gap-1.5 text-[11px]"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Akhiri Hubungan Pemantauan</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 sm:px-4 rounded-t-xl gap-1 overflow-x-auto text-xs font-semibold">
        {(
          [
            { id: 'monitoring', label: `Monitoring (${vitals.length})`, icon: HeartPulse },
            { id: 'grafik', label: 'Grafik Tren', icon: LineChart },
            { id: 'peringatan', label: `Peringatan (${alerts.length})`, icon: AlertTriangle },
            { id: 'dokumentasi', label: `Asuhan (${carePlans.length})`, icon: FileText },
            { id: 'obat', label: `Obat (${medications.length})`, icon: Pill },
            { id: 'kontrol', label: `Kontrol (${appointments.length})`, icon: Calendar },
            { id: 'edukasi', label: `Edukasi (${educationNotes.length})`, icon: BookOpen },
            { id: 'pesan', label: 'Pesan Pasien', icon: MessageSquare },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-2.5 sm:px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: MONITORING */}
      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          {vitals.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500">Tekanan Darah</span>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {vitals[0].systolic_bp}/{vitals[0].diastolic_bp} <span className="text-[10px] font-normal text-slate-500">mmHg</span>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500">Denyut Nadi</span>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {vitals[0].heart_rate} <span className="text-[10px] font-normal text-slate-500">bpm</span>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500">Frekuensi Napas</span>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {vitals[0].respiratory_rate} <span className="text-[10px] font-normal text-slate-500">x/mnt</span>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500">Suhu Tubuh</span>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {vitals[0].body_temperature} <span className="text-[10px] font-normal text-slate-500">°C</span>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500">Saturasi SpO2</span>
                <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                  {vitals[0].oxygen_saturation} <span className="text-[10px] font-normal text-slate-500">%</span>
                </div>
              </div>
            </div>
          )}

          {/* Vitals History */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Riwayat Pemantauan Tanda Vital
              </h3>
            </div>
            {vitals.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Pasien belum mengirimkan catatan tanda vital.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Waktu Rekam</th>
                      <th className="py-2.5 px-4">TD</th>
                      <th className="py-2.5 px-4">Nadi</th>
                      <th className="py-2.5 px-4">Napas</th>
                      <th className="py-2.5 px-4">Suhu</th>
                      <th className="py-2.5 px-4">SpO2</th>
                      <th className="py-2.5 px-4">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {vitals.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                          {new Date(v.recorded_at).toLocaleDateString('id-ID')}{' '}
                          {new Date(v.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{v.systolic_bp}/{v.diastolic_bp}</td>
                        <td className="py-3 px-4">{v.heart_rate} bpm</td>
                        <td className="py-3 px-4">{v.respiratory_rate} x/m</td>
                        <td className="py-3 px-4">{v.body_temperature} °C</td>
                        <td className="py-3 px-4">{v.oxygen_saturation} %</td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{v.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Symptoms & General Condition Records (previously missing!) */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Keluhan, Gejala & Kondisi Umum Pasien
              </h3>
            </div>
            {symptomRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Belum ada catatan keluhan/gejala tercatat.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {symptomRecords.map((s) => (
                  <div key={s.id} className="p-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        {new Date(s.recorded_at).toLocaleDateString('id-ID')}{' '}
                        {new Date(s.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold text-[10px] capitalize">
                          Kondisi: {(s.general_condition || 'baik').replace('_', ' ')}
                        </span>
                        {s.symptom_trend && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px] capitalize">
                            Tren: {s.symptom_trend}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.symptoms && s.symptoms.length > 0 ? (
                        s.symptoms.map((sym) => (
                          <span key={sym} className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-900 rounded text-[11px] font-medium">
                            {sym}
                          </span>
                        ))
                      ) : (
                        <span className="text-emerald-700 font-medium text-[11px]">Tidak ada keluhan tambahan</span>
                      )}
                    </div>
                    {s.notes && (
                      <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded">{s.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pain & Wound Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Laporan Skala & Karakteristik Nyeri
                </h3>
              </div>
              {painRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Belum ada laporan nyeri tercatat.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {painRecords.map((p) => (
                    <div key={p.id} className="p-4 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          Skala Nyeri: <span className="text-teal-700 text-sm font-extrabold">{p.pain_scale}/10</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(p.recorded_at).toLocaleDateString('id-ID')}{' '}
                          {new Date(p.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        <strong>Lokasi:</strong> {p.location || 'Area operasi'} · <strong>Karakteristik:</strong> {p.characteristics}
                      </div>
                      {(p.aggravating_factors || p.relieving_factors) && (
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                          {p.aggravating_factors && (
                            <span>Pemberat: {p.aggravating_factors}</span>
                          )}
                          {p.relieving_factors && (
                            <span>Peringan: {p.relieving_factors}</span>
                          )}
                        </div>
                      )}
                      {p.notes && (
                        <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded">{p.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Evaluasi Kondisi Luka Operasi
                </h3>
              </div>
              {woundRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Belum ada evaluasi luka operasi tercatat.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {woundRecords.map((w) => (
                    <div key={w.id} className="p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          {new Date(w.recorded_at).toLocaleDateString('id-ID')}{' '}
                          {new Date(w.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {w.has_discharge_or_pus || w.has_bleeding || w.has_open_wound ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Tanda Bahaya Luka
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                            Bersih / Normal
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div className={w.has_redness ? 'text-amber-700 font-semibold' : 'text-slate-400'}>· Kemerahan: {w.has_redness ? 'Ya' : 'Tidak'}</div>
                        <div className={w.has_swelling ? 'text-amber-700 font-semibold' : 'text-slate-400'}>· Bengkak: {w.has_swelling ? 'Ya' : 'Tidak'}</div>
                        <div className={w.has_warmth ? 'text-amber-700 font-semibold' : 'text-slate-400'}>· Hangat: {w.has_warmth ? 'Ya' : 'Tidak'}</div>
                        <div className={w.has_discharge_or_pus ? 'text-rose-700 font-bold' : 'text-slate-400'}>· Nanah: {w.has_discharge_or_pus ? 'Positif' : 'Tidak'}</div>
                        <div className={w.has_bleeding ? 'text-rose-700 font-bold' : 'text-slate-400'}>· Perdarahan: {w.has_bleeding ? 'Ada' : 'Tidak'}</div>
                        <div className={w.has_open_wound ? 'text-rose-700 font-bold' : 'text-slate-400'}>· Luka Terbuka: {w.has_open_wound ? 'Ya' : 'Tidak'}</div>
                      </div>
                      {w.notes && <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded">{w.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GRAFIK */}
      {activeTab === 'grafik' && <MetricChartsView vitals={vitals} painRecords={painRecords} />}

      {/* TAB 3: PERINGATAN */}
      {activeTab === 'peringatan' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Daftar Peringatan Pasien
            </h3>
          </div>
          {alerts.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">Belum ada riwayat peringatan untuk pasien ini.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {alerts.map((al) => {
                const isDarurat = al.alert_level === 'darurat';
                const isUrgent = al.alert_level === 'urgent';
                const isResolving = resolvingAlertId === al.id;
                return (
                  <div key={al.id} className="p-4 space-y-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isDarurat ? 'bg-rose-100 text-rose-800' : isUrgent ? 'bg-amber-100 text-amber-800' : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {al.alert_level}
                        </span>
                        <span className="font-semibold text-slate-900">{al.title}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {new Date(al.created_at).toLocaleString('id-ID')} · {al.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-slate-600 bg-slate-50 p-3 rounded-lg">{al.description}</p>
                    {al.resolution_notes && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-lg">
                        <strong>Catatan Perawat:</strong> {al.resolution_notes}
                      </div>
                    )}
                    {al.status !== 'selesai' && !isDemoMode && (
                      <div className="pt-1">
                        {isResolving ? (
                          <div className="bg-slate-50 p-3 rounded-lg space-y-2">
                            <input
                              type="text"
                              value={resolutionNotes}
                              onChange={(e) => setResolutionNotes(e.target.value)}
                              placeholder="Tuliskan catatan tindak lanjut untuk pasien..."
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setResolvingAlertId(null)} className="px-3 py-1 text-slate-600">Batal</button>
                              <button onClick={() => handleResolveAlert(al.id, 'ditinjau')} className="px-3 py-1 bg-amber-600 text-white rounded font-medium">Tandai Ditinjau</button>
                              <button onClick={() => handleResolveAlert(al.id, 'selesai')} className="px-3 py-1 bg-emerald-600 text-white rounded font-medium">Selesaikan</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setResolvingAlertId(al.id);
                              setResolutionNotes('');
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                          >
                            Tindak Lanjut Peringatan
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DOKUMENTASI */}
      {activeTab === 'dokumentasi' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Dokumentasi Asuhan Keperawatan (SDKI/SLKI/SIKI/SOAP)
              </h3>
            </div>
            <button
              onClick={() => {
                resetCarePlanForm();
                setIsAddingCarePlan(true);
              }}
              className="self-start px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tulis Dokumentasi</span>
            </button>
          </div>

          {isAddingCarePlan && (
            <form onSubmit={handleSaveCarePlan} className="bg-white p-5 rounded-xl border-2 border-teal-500 space-y-3.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-sm text-teal-800">
                  {editingCarePlanId ? 'Edit Asuhan Keperawatan' : 'Asuhan Keperawatan Baru'}
                </span>
                <button type="button" onClick={resetCarePlanForm} className="text-slate-400 hover:text-slate-700">Batal</button>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">1. Pengkajian (Assessment) *</label>
                <textarea required rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data Subjektif (S)</label>
                  <textarea rows={2} value={subjectiveData} onChange={(e) => setSubjectiveData(e.target.value)} placeholder="Keluhan yang disampaikan pasien..." className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data Objektif (O)</label>
                  <textarea rows={2} value={objectiveData} onChange={(e) => setObjectiveData(e.target.value)} placeholder="Hasil TTV, observasi luka, skala nyeri..." className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">2. Diagnosis Keperawatan (SDKI) *</label>
                <input type="text" required value={nursingDiagnosis} onChange={(e) => setNursingDiagnosis(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">3. Tujuan & Luaran (SLKI)</label>
                  <textarea rows={2} value={goalsOutcomes} onChange={(e) => setGoalsOutcomes(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">4. Intervensi (SIKI)</label>
                  <textarea rows={2} value={interventions} onChange={(e) => setInterventions(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">5. Implementasi</label>
                  <textarea rows={2} value={implementation} onChange={(e) => setImplementation(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">6. Evaluasi (SOAP)</label>
                  <textarea rows={2} value={evaluation} onChange={(e) => setEvaluation(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={resetCarePlanForm} className="px-3 py-1.5 text-slate-600">Batal</button>
                <button type="submit" disabled={submittingCarePlan} className="px-4 py-1.5 bg-teal-600 text-white rounded-lg font-semibold">
                  {submittingCarePlan ? 'Menyimpan...' : 'Simpan Dokumentasi'}
                </button>
              </div>
            </form>
          )}

          {carePlans.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-xs text-slate-400">
              Belum ada dokumentasi asuhan keperawatan untuk pasien ini.
            </div>
          ) : (
            <div className="space-y-4">
              {carePlans.map((cp, idx) => (
                <div key={cp.id} className="bg-white p-5 rounded-xl border border-slate-200 space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-bold text-teal-800 text-sm">Dokumentasi #{carePlans.length - idx}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{new Date(cp.created_at).toLocaleDateString('id-ID')}</span>
                      {!isDemoMode && (
                        <button onClick={() => startEditCarePlan(cp)} className="p-1 text-slate-500 hover:text-teal-700" title="Edit">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <strong className="text-slate-700">Diagnosis:</strong>
                    <p className="font-semibold text-slate-900 mt-0.5">{cp.nursing_diagnosis}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-600 bg-slate-50 p-3 rounded-lg">
                    <div><strong>Pengkajian:</strong> <p className="mt-0.5">{cp.assessment}</p></div>
                    <div><strong>Luaran:</strong> <p className="mt-0.5">{cp.goals_outcomes || '-'}</p></div>
                    {cp.subjective_data && (
                      <div><strong>Data Subjektif (S):</strong> <p className="mt-0.5">{cp.subjective_data}</p></div>
                    )}
                    {cp.objective_data && (
                      <div><strong>Data Objektif (O):</strong> <p className="mt-0.5">{cp.objective_data}</p></div>
                    )}
                    <div><strong>Intervensi:</strong> <p className="mt-0.5">{cp.interventions || '-'}</p></div>
                    <div><strong>Implementasi:</strong> <p className="mt-0.5">{cp.implementation || '-'}</p></div>
                  </div>
                  {cp.evaluation && (
                    <div className="p-3 bg-teal-50/60 border border-teal-100 rounded-lg text-teal-900">
                      <strong>Evaluasi (SOAP):</strong> <p className="mt-0.5">{cp.evaluation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: OBAT */}
      {activeTab === 'obat' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Resep Obat Pascaoperasi & Log Kepatuhan
              </h3>
            </div>
            <button
              onClick={() => {
                resetMedForm();
                setIsAddingMed(true);
              }}
              className="self-start px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Obat</span>
            </button>
          </div>

          {isAddingMed && (
            <form onSubmit={handleSaveMedication} className="bg-white p-5 rounded-xl border-2 border-teal-500 space-y-3 text-xs">
              <span className="font-bold text-teal-900 block text-sm">
                {editingMedId ? 'Edit Resep Obat' : 'Resep Obat Baru'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nama Obat *</label>
                  <input type="text" required value={medName} onChange={(e) => setMedName(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dosis *</label>
                  <input type="text" required value={medDosage} onChange={(e) => setMedDosage(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Frekuensi</label>
                  <input type="text" value={medFrequency} onChange={(e) => setMedFrequency(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Petunjuk Khusus</label>
                <input type="text" value={medInstructions} onChange={(e) => setMedInstructions(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={resetMedForm} className="px-3 py-1.5 text-slate-600">Batal</button>
                <button type="submit" disabled={savingMed} className="px-4 py-1.5 bg-teal-600 text-white rounded font-medium disabled:opacity-50">
                  {savingMed ? 'Menyimpan...' : 'Simpan Obat'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-700">
              Daftar Resep Obat
            </div>
            {medications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Belum ada obat yang dimasukkan.</div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {medications.map((m) => (
                  <div key={m.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <span>{m.medication_name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${m.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {m.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="text-slate-600 mt-0.5">Dosis: <strong>{m.dosage}</strong> · {m.frequency}</div>
                      {m.instructions && <div className="text-slate-500 text-[11px]">{m.instructions}</div>}
                    </div>
                    {!isDemoMode && (
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button onClick={() => startEditMed(m)} className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded" title="Edit obat">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleToggleMedActive(m)} className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-slate-100 rounded" title="Aktif/Nonaktifkan">
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteMedId === m.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteMed(m.id)}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-semibold"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMedId(null)}
                              className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[10px]"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMedId(m.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                            title="Hapus obat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-700">
              Log Kepatuhan Minum Obat
            </div>
            {adherenceLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Belum ada catatan kepatuhan dari pasien.</div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {adherenceLogs.map((log) => (
                  <div key={log.id} className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-slate-900">
                          {log.medication?.medication_name || 'Obat'}
                          {log.medication?.dosage ? ` (${log.medication.dosage})` : ''}
                        </span>
                        <span className="text-slate-400 text-[11px] ml-2">
                          {new Date(log.taken_time || log.scheduled_time).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[10px] uppercase shrink-0 ${
                          log.status === 'diminum' ? 'bg-emerald-100 text-emerald-800' : log.status === 'terlambat' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.status.replace('_', ' ')}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1 rounded">
                        Catatan pasien: {log.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: JADWAL KONTROL */}
      {activeTab === 'kontrol' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Jadwal Kontrol Pascaoperasi</h3>
            </div>
            <button
              onClick={() => {
                resetApptForm();
                setIsAddingAppt(true);
              }}
              className="self-start px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Jadwal Kontrol</span>
            </button>
          </div>

          {isAddingAppt && (
            <form onSubmit={handleSaveAppointment} className="bg-white p-5 rounded-xl border-2 border-teal-500 space-y-3 text-xs">
              <span className="font-bold text-teal-900 block text-sm">
                {editingApptId ? 'Edit Jadwal Kontrol' : 'Jadwal Kontrol Baru'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Kontrol *</label>
                  <input type="date" required value={apptDate} onChange={(e) => setApptDate(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Waktu / Jam</label>
                  <input type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Lokasi Poliklinik / RS</label>
                  <input type="text" value={apptLocation} onChange={(e) => setApptLocation(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dokter Pemeriksa</label>
                  <input type="text" value={apptDoctor} onChange={(e) => setApptDoctor(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan Persiapan Pasien</label>
                <input type="text" value={apptNotes} onChange={(e) => setApptNotes(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={resetApptForm} className="px-3 py-1.5 text-slate-600">Batal</button>
                <button type="submit" disabled={savingAppt} className="px-4 py-1.5 bg-teal-600 text-white rounded font-medium disabled:opacity-50">
                  {savingAppt ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {appointments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">Belum ada jadwal kontrol untuk pasien ini.</div>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {appointments.map((a) => (
                  <div key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <Calendar className="w-4 h-4 text-teal-600" />
                        <span className="font-bold text-slate-900 text-sm">
                          {formatLocalDate(a.appointment_date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        {a.appointment_time && <span className="font-semibold text-slate-700">Pukul {a.appointment_time} WIB</span>}
                      </div>
                      <div className="text-slate-600">
                        <strong>Lokasi:</strong> {a.location} {a.doctor_name && `· Dokter: ${a.doctor_name}`}
                      </div>
                      {a.notes && <div className="text-slate-500 text-[11px]">{a.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!isDemoMode ? (
                        <>
                          <select
                            value={a.status}
                            onChange={(e) => handleUpdateApptStatus(a.id, e.target.value as any)}
                            className="px-2 py-1 text-[11px] font-semibold border border-slate-200 rounded-lg bg-slate-50"
                          >
                            <option value="terjadwal">Terjadwal</option>
                            <option value="selesai">Selesai</option>
                            <option value="dibatalkan">Dibatalkan</option>
                          </select>
                          <button onClick={() => startEditAppt(a)} className="p-1.5 text-slate-500 hover:text-teal-700" title="Edit jadwal">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase bg-teal-50 text-teal-800">
                          {a.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: EDUKASI PASIEN */}
      {activeTab === 'edukasi' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Catatan & Edukasi Perawatan Khusus Pasien
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Materi edukasi personal ini tampil langsung di menu Perawatan pada Portal Pasien.
              </p>
            </div>
            <button
              onClick={() => setIsAddingEdu(true)}
              className="self-start px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Kirim Edukasi Pasien</span>
            </button>
          </div>

          {isAddingEdu && (
            <form onSubmit={handleAddEducation} className="bg-white p-5 rounded-xl border-2 border-teal-500 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Judul Edukasi *</label>
                  <input
                    type="text"
                    required
                    value={eduTitle}
                    onChange={(e) => setEduTitle(e.target.value)}
                    placeholder="Misal: Cara Mengganti Kasa Luka di Rumah"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={eduCategory}
                    onChange={(e) => setEduCategory(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="perawatan_luka">Perawatan Luka</option>
                    <option value="nutrisi">Nutrisi & Diet</option>
                    <option value="mobilisasi">Aktivitas & Mobilisasi</option>
                    <option value="obat">Kepatuhan Obat</option>
                    <option value="lainnya">Instruksi Khusus Lainnya</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Isi Panduan / Instruksi *</label>
                <textarea
                  required
                  rows={3}
                  value={eduContent}
                  onChange={(e) => setEduContent(e.target.value)}
                  placeholder="Tuliskan langkah perawatan yang mudah dipahami pasien..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddingEdu(false)} className="px-3 py-1.5 text-slate-600">Batal</button>
                <button
                  type="submit"
                  disabled={savingEdu}
                  className="px-4 py-1.5 bg-teal-600 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {savingEdu ? 'Mengirim...' : 'Kirim ke Pasien'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {educationNotes.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada catatan edukasi khusus yang dikirim ke pasien ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {educationNotes.map((ed) => (
                  <div key={ed.id} className="p-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 text-sm">{ed.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold uppercase">
                          {ed.category.replace('_', ' ')}
                        </span>
                        {!isDemoMode && (
                          confirmDeleteEduId === ed.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteEducation(ed.id)}
                                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-semibold"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEduId(null)}
                                className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px]"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEduId(ed.id)}
                              className="text-slate-400 hover:text-rose-600"
                              title="Hapus materi edukasi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{ed.content}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px]">
                      <span className="text-slate-400">
                        Dikirim {new Date(ed.created_at).toLocaleDateString('id-ID')}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          ed.is_read
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {ed.is_read ? 'Sudah Dibaca Pasien' : 'Belum Dibaca Pasien'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: PESAN PASIEN */}
      {activeTab === 'pesan' && user && (
        <PatientNurseChat
          patientId={patientId}
          nurseId={user.id}
          currentUserId={user.id}
          currentUserRole="nurse"
          currentUserName={currentNurseProfile?.full_name || 'Perawat'}
          counterpartName={profile?.full_name || 'Pasien'}
          isDemoMode={isDemoMode}
        />
      )}
    </div>
  );
};
