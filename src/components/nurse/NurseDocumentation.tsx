/**
 * Nurse Documentation Overview in NurseGo
 *
 * - Displays all nursing care plans across nurse's patients
 * - Search by patient name or diagnosis
 * - Allows creating new SOAP care plans directly from this page
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { fetchNurseRelationships } from '../../lib/nurseRelationships';
import { DEMO_PATIENTS } from '../../data/mockData';
import { FileText, RefreshCw, ArrowRight, Plus, Search, AlertCircle } from 'lucide-react';

interface NurseDocumentationProps {
  onSelectPatient: (patientId: string) => void;
}

export const NurseDocumentation: React.FC<NurseDocumentationProps> = ({ onSelectPatient }) => {
  const { user, isDemoMode } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [carePlans, setCarePlans] = useState<any[]>([]);
  const [assignedPatients, setAssignedPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create new care plan form
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [subjectiveData, setSubjectiveData] = useState('');
  const [objectiveData, setObjectiveData] = useState('');
  const [assessment, setAssessment] = useState('');
  const [nursingDiagnosis, setNursingDiagnosis] = useState('');
  const [goalsOutcomes, setGoalsOutcomes] = useState('');
  const [interventions, setInterventions] = useState('');
  const [implementation, setImplementation] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCarePlans = useCallback(async () => {
    if (!user) return;

    if (isDemoMode) {
      const demoPlans = DEMO_PATIENTS.flatMap((dp) =>
        dp.carePlans.map((cp) => ({
          ...cp,
          patient: dp.profile,
        }))
      );
      setCarePlans(demoPlans);
      setAssignedPatients(DEMO_PATIENTS.map((dp) => ({ id: dp.profile.id, full_name: dp.profile.full_name })));
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    const supabase = getSupabase();

    try {
      const [{ data, error }, relResult] = await Promise.all([
        supabase
          .from('nursing_care_plans')
          .select('*')
          .eq('nurse_id', user.id)
          .order('created_at', { ascending: false }),
        fetchNurseRelationships(supabase, user.id),
      ]);

      if (error) throw error;
      if (relResult.error) throw new Error(relResult.error);

      const assignIds = relResult.active.map((a) => a.patient_id);
      const cpPatientIds = (data || []).map((cp: any) => cp.patient_id);
      const allPatientIds = Array.from(new Set([...assignIds, ...cpPatientIds]));

      let profiles: any[] = [];
      if (allPatientIds.length > 0) {
        const { data: profData, error: profErr } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allPatientIds);
        if (profErr) {
          setErrorMsg(`Sebagian data nama pasien gagal dimuat: ${profErr.message}`);
        }
        profiles = profData || [];
      }

      setAssignedPatients(
        assignIds.map((pid: string) => {
          const p = profiles.find((pr) => pr.id === pid);
          return { id: pid, full_name: p?.full_name || 'Pasien' };
        })
      );
      setSelectedPatientId((prev) => (assignIds.includes(prev) ? prev : assignIds[0] || ''));

      const merged = (data || []).map((cp: any) => ({
        ...cp,
        patient: profiles.find((p) => p.id === cp.patient_id),
      }));
      setCarePlans(merged);
    } catch (err: any) {
      setErrorMsg(`Gagal memuat dokumentasi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    fetchCarePlans();
  }, [fetchCarePlans]);

  useRealtimeSubscription(
    `nurse-docs-${user?.id || 'anon'}`,
    user && !isDemoMode
      ? [
          { table: 'nursing_care_plans', filter: `nurse_id=eq.${user.id}` },
          { table: 'patient_nurse_assignments', filter: `nurse_id=eq.${user.id}` },
        ]
      : [],
    fetchCarePlans,
    Boolean(user && !isDemoMode)
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPatientId || !assessment.trim() || !nursingDiagnosis.trim() || isDemoMode) return;
    setSaving(true);
    setErrorMsg(null);
    const supabase = getSupabase();
    try {
      const fullPayload = {
        patient_id: selectedPatientId,
        nurse_id: user.id,
        subjective_data: subjectiveData.trim() || null,
        objective_data: objectiveData.trim() || null,
        assessment: assessment.trim(),
        nursing_diagnosis: nursingDiagnosis.trim(),
        goals_outcomes: goalsOutcomes.trim(),
        interventions: interventions.trim(),
        implementation: implementation.trim(),
        evaluation: evaluation.trim(),
      };

      let { error } = await supabase.from('nursing_care_plans').insert(fullPayload);
      if (
        error &&
        (error.message.includes('subjective_data') ||
          error.message.includes('objective_data') ||
          error.code === 'PGRST204' ||
          error.code === '42703')
      ) {
        const combinedAssessment = [
          subjectiveData.trim() ? `S: ${subjectiveData.trim()}` : '',
          objectiveData.trim() ? `O: ${objectiveData.trim()}` : '',
          `A: ${assessment.trim()}`,
        ]
          .filter(Boolean)
          .join('\n');
        const { subjective_data: _s, objective_data: _o, ...legacyPayload } = fullPayload;
        const retry = await supabase.from('nursing_care_plans').insert({
          ...legacyPayload,
          assessment: combinedAssessment,
        });
        error = retry.error;
      }
      if (error) throw error;

      setIsCreating(false);
      setSubjectiveData('');
      setObjectiveData('');
      setAssessment('');
      setNursingDiagnosis('');
      setGoalsOutcomes('');
      setInterventions('');
      setImplementation('');
      setEvaluation('');
      fetchCarePlans();
    } catch (err: any) {
      setErrorMsg(`Gagal menyimpan dokumentasi: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const filtered = carePlans.filter(
    (cp) =>
      (cp.patient?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (cp.nursing_diagnosis || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Dokumentasi Asuhan Keperawatan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Arsip pengkajian, diagnosis (SDKI), intervensi (SIKI), dan evaluasi (SOAP).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCarePlans()}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Muat ulang dokumentasi"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!isDemoMode && assignedPatients.length > 0 && (
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Tulis Catatan Baru</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-white p-5 rounded-xl border-2 border-teal-500 space-y-3 text-xs">
          <div className="font-bold text-sm text-teal-900">Buat Dokumentasi Asuhan Baru</div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Pilih Pasien *</label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
            >
              {assignedPatients.map((ap) => (
                <option key={ap.id} value={ap.id}>
                  {ap.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Diagnosis Keperawatan (SDKI) *</label>
            <input
              type="text"
              required
              value={nursingDiagnosis}
              onChange={(e) => setNursingDiagnosis(e.target.value)}
              placeholder="Nyeri Akut b.d Agen Pencedera Fisik"
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Data Subjektif (S)</label>
              <textarea rows={2} value={subjectiveData} onChange={(e) => setSubjectiveData(e.target.value)} placeholder="Keluhan yang disampaikan pasien (nyeri, mual, dll)..." className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Data Objektif (O)</label>
              <textarea rows={2} value={objectiveData} onChange={(e) => setObjectiveData(e.target.value)} placeholder="Hasil observasi tanda vital, kondisi luka, skala nyeri..." className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pengkajian & Analisis (A) *</label>
              <textarea required rows={2} value={assessment} onChange={(e) => setAssessment(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tujuan & Luaran (SLKI)</label>
              <textarea rows={2} value={goalsOutcomes} onChange={(e) => setGoalsOutcomes(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Intervensi (SIKI)</label>
              <textarea rows={2} value={interventions} onChange={(e) => setInterventions(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Implementasi</label>
              <textarea rows={2} value={implementation} onChange={(e) => setImplementation(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Evaluasi & Rencana Tindak Lanjut (P/SOAP)</label>
            <textarea rows={2} value={evaluation} onChange={(e) => setEvaluation(e.target.value)} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-slate-600">Batal</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 bg-teal-600 text-white rounded-lg font-semibold">
              {saving ? 'Menyimpan...' : 'Simpan Dokumentasi'}
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari berdasarkan nama pasien atau diagnosis keperawatan..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600 mb-2" />
            <span>Mengambil arsip dokumentasi keperawatan...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <FileText className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-medium text-slate-700">Belum ada dokumentasi asuhan keperawatan.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((cp) => (
              <div key={cp.id} className="p-5 space-y-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center flex-wrap gap-2">
                    <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-slate-900">{cp.patient?.full_name || 'Pasien'}</span>
                    {cp.patient?.email && <span className="text-xs text-slate-400">({cp.patient.email})</span>}
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {new Date(cp.created_at).toLocaleDateString('id-ID')}{' '}
                    {new Date(cp.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 font-semibold">Diagnosis Keperawatan:</span>
                  <p className="text-xs font-bold text-teal-900 mt-0.5">{cp.nursing_diagnosis}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-700">
                  {cp.subjective_data && (
                    <div>
                      <strong>Data Subjektif (S):</strong>
                      <p className="text-[11px] text-slate-600 mt-0.5">{cp.subjective_data}</p>
                    </div>
                  )}
                  {cp.objective_data && (
                    <div>
                      <strong>Data Objektif (O):</strong>
                      <p className="text-[11px] text-slate-600 mt-0.5">{cp.objective_data}</p>
                    </div>
                  )}
                  <div>
                    <strong>Pengkajian:</strong>
                    <p className="text-[11px] text-slate-600 mt-0.5">{cp.assessment}</p>
                  </div>
                  {cp.goals_outcomes && (
                    <div>
                      <strong>Luaran (SLKI):</strong>
                      <p className="text-[11px] text-slate-600 mt-0.5">{cp.goals_outcomes}</p>
                    </div>
                  )}
                  <div>
                    <strong>Intervensi (SIKI):</strong>
                    <p className="text-[11px] text-slate-600 mt-0.5">{cp.interventions || '-'}</p>
                  </div>
                  {cp.implementation && (
                    <div>
                      <strong>Implementasi:</strong>
                      <p className="text-[11px] text-slate-600 mt-0.5">{cp.implementation}</p>
                    </div>
                  )}
                </div>

                {cp.evaluation && (
                  <div className="text-xs text-teal-900 bg-teal-50/70 p-2.5 rounded-lg border border-teal-100">
                    <strong>Evaluasi (SOAP):</strong>
                    <p className="text-[11px] mt-0.5">{cp.evaluation}</p>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    onClick={() => onSelectPatient(cp.patient_id)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
                  >
                    <span>Lihat Rekam Medis Pasien</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
