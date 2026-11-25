/**
 * Patient List Management for Nurses in NurseGo
 *
 * - Displays active assigned patients, incoming patient-initiated consent requests (`pending_nurse`),
 *   outgoing nurse link requests (`pending_patient`), and pending invitations (`patient_invitations`)
 * - Strictly filters by the 7 canonical MVP Surgery Types
 * - Uses inline confirmations (never browser dialogs)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { getPatientActivationUrl } from '../../lib/appUrl';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { fetchNurseRelationships } from '../../lib/nurseRelationships';
import { DEMO_PATIENTS, DEMO_VITALS, DEMO_ALERTS } from '../../data/mockData';
import { MVP_SURGERY_DEFINITIONS, matchMvpDefinition } from '../../lib/surgeryTemplates';
import { formatLocalDate, parseLocalDate } from '../../lib/dateUtils';
import { PatientInvitation, RelationshipSummary } from '../../types/database';
import {
  Users,
  Search,
  UserPlus,
  RefreshCw,
  ArrowRight,
  Filter,
  MailCheck,
  Copy,
  Check,
  Trash2,
  UserCheck,
  Clock,
  X,
} from 'lucide-react';

interface PatientListProps {
  onSelectPatient: (patientId: string) => void;
  onOpenAddPatient: () => void;
  refreshTrigger?: number;
}

export const PatientList: React.FC<PatientListProps> = ({
  onSelectPatient,
  onOpenAddPatient,
  refreshTrigger = 0,
}) => {
  const { user, isDemoMode } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [patients, setPatients] = useState<any[]>([]);
  const [pendingConsentIncoming, setPendingConsentIncoming] = useState<RelationshipSummary[]>([]);
  const [pendingConsentOutgoing, setPendingConsentOutgoing] = useState<RelationshipSummary[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PatientInvitation[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedSurgeryFilter, setSelectedSurgeryFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteInviteId, setConfirmDeleteInviteId] = useState<string | null>(null);
  const [confirmCancelReqId, setConfirmCancelReqId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rpcNotice, setRpcNotice] = useState<string | null>(null);

  const fetchPatients = useCallback(async () => {
    if (!user) return;

    if (isDemoMode) {
      setPatients(
        DEMO_PATIENTS.map((dp) => {
          const pVitals = DEMO_VITALS.filter((v) => v.patient_id === dp.profile.id);
          const pAlerts = DEMO_ALERTS.filter((a) => a.patient_id === dp.profile.id && a.status === 'aktif');
          let highestAlert: string | null = null;
          if (pAlerts.some((a) => a.alert_level === 'darurat')) highestAlert = 'darurat';
          else if (pAlerts.some((a) => a.alert_level === 'urgent')) highestAlert = 'urgent';
          else if (pAlerts.some((a) => a.alert_level === 'waspada')) highestAlert = 'waspada';
          return {
            id: dp.profile.id,
            fullName: dp.profile.full_name,
            email: dp.profile.email,
            phone: dp.profile.phone,
            gender: dp.patient_profile.gender || '-',
            age: dp.patient_profile.date_of_birth
              ? `${new Date().getFullYear() - new Date(dp.patient_profile.date_of_birth).getFullYear()} thn`
              : '-',
            surgery: dp.surgery,
            latestVital: pVitals[0],
            activeAlerts: pAlerts,
            highestAlert,
          };
        })
      );
      setPendingConsentIncoming([]);
      setPendingConsentOutgoing([]);
      setPendingInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setRpcNotice(null);
    const supabase = getSupabase();

    try {
      const relResult = await fetchNurseRelationships(supabase, user.id);
      setRpcNotice(relResult.rpcNotice);
      setPendingConsentIncoming(relResult.pendingIncoming);
      setPendingConsentOutgoing(relResult.pendingOutgoing);
      if (relResult.error) {
        setErrorMsg(relResult.error);
      }
      const activeAssignments = relResult.active;

      if (activeAssignments.length > 0) {
        const patientIds = activeAssignments.map((a: any) => a.patient_id);

        const [
          { data: profiles, error: profErr },
          { data: patientProfiles, error: pProfErr },
          { data: surgeries, error: surgErr },
          { data: vitals, error: vitErr },
          { data: alerts, error: alErr },
        ] = await Promise.all([
          supabase.from('profiles').select('*').in('id', patientIds),
          supabase.from('patient_profiles').select('*').in('id', patientIds),
          supabase
            .from('patient_surgeries')
            .select('*, surgery_type:surgery_types(*)')
            .in('patient_id', patientIds)
            .order('surgery_date', { ascending: false }),
          supabase.from('vital_sign_records').select('*').in('patient_id', patientIds).order('recorded_at', { ascending: false }),
          supabase.from('patient_alerts').select('*').in('patient_id', patientIds).eq('status', 'aktif'),
        ]);

        const subErr = profErr || pProfErr || surgErr || vitErr || alErr;
        if (subErr) {
          setErrorMsg((prev) => prev || `Sebagian data pasien gagal dimuat: ${subErr.message}`);
        }

        const merged = activeAssignments.map((assign: any) => {
          const prof = profiles?.find((p: any) => p.id === assign.patient_id);
          const pProf = patientProfiles?.find((p: any) => p.id === assign.patient_id);
          const surg = surgeries?.find((s: any) => s.patient_id === assign.patient_id);
          const latestVit = vitals?.find((v: any) => v.patient_id === assign.patient_id);
          const pAlerts = alerts?.filter((a: any) => a.patient_id === assign.patient_id) || [];

          let highestAlert: string | null = null;
          if (pAlerts.some((a: any) => a.alert_level === 'darurat')) highestAlert = 'darurat';
          else if (pAlerts.some((a: any) => a.alert_level === 'urgent')) highestAlert = 'urgent';
          else if (pAlerts.some((a: any) => a.alert_level === 'waspada')) highestAlert = 'waspada';

          let age = '-';
          const parsedDob = parseLocalDate(pProf?.date_of_birth);
          if (parsedDob) {
            age = `${new Date().getFullYear() - parsedDob.getFullYear()} thn`;
          }

          return {
            id: assign.patient_id,
            assignmentId: assign.id,
            fullName: prof?.full_name || assign.counterpart_name || 'Pasien',
            email: prof?.email || assign.counterpart_email || '',
            phone: prof?.phone || assign.counterpart_phone || '-',
            gender: pProf?.gender || '-',
            age,
            surgery: surg,
            latestVital: latestVit,
            activeAlerts: pAlerts,
            highestAlert,
            assignedAt: assign.assigned_at,
          };
        });

        setPatients(merged);
      } else {
        setPatients([]);
      }

      const { data: invitesData, error: invErr } = await supabase
        .from('patient_invitations')
        .select('*')
        .eq('nurse_id', user.id)
        .neq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (invErr) {
        setErrorMsg((prev) => prev || `Gagal memuat daftar undangan pasien: ${invErr.message}`);
      }
      setPendingInvitations((invitesData as PatientInvitation[]) || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat daftar pasien.');
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients, refreshTrigger]);

  useRealtimeSubscription(
    `nurse-list-${user?.id || 'anon'}`,
    [
      { table: 'patient_nurse_assignments', filter: user ? `nurse_id=eq.${user.id}` : undefined },
      { table: 'patient_invitations', filter: user ? `nurse_id=eq.${user.id}` : undefined },
      { table: 'vital_sign_records' },
      { table: 'patient_alerts' },
    ],
    fetchPatients,
    Boolean(user && !isDemoMode)
  );

  const handleRespondConsent = async (assignmentId: string, accept: boolean) => {
    setRespondingId(assignmentId);
    setErrorMsg(null);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('respond_nurse_patient_assignment', {
        p_assignment_id: assignmentId,
        p_accept: accept,
      });
      if (error) {
        throw new Error(
          isMissingRpcError(error)
            ? 'Fungsi `respond_nurse_patient_assignment` belum tersedia di Supabase. Jalankan migrasi `004_live_sync_consent_rpcs_and_mvp.sql`.'
            : error.message
        );
      }
      if (!data?.success) throw new Error(data?.reason || 'Gagal merespons undangan.');
      await fetchPatients();
    } catch (err: any) {
      setErrorMsg(`Gagal memproses persetujuan: ${err.message}`);
    } finally {
      setRespondingId(null);
    }
  };

  const handleCancelOutgoingRequest = async (assignmentId: string) => {
    setRespondingId(assignmentId);
    setErrorMsg(null);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('end_nurse_patient_assignment', {
        p_assignment_id: assignmentId,
      });
      if (error) {
        throw new Error(
          isMissingRpcError(error)
            ? 'Fungsi `end_nurse_patient_assignment` belum tersedia di Supabase. Jalankan migrasi `004_live_sync_consent_rpcs_and_mvp.sql`.'
            : error.message
        );
      }
      if (!data?.success) throw new Error(data?.reason || 'Gagal membatalkan permintaan.');
      setConfirmCancelReqId(null);
      await fetchPatients();
    } catch (err: any) {
      setErrorMsg(`Gagal membatalkan permintaan: ${err.message}`);
    } finally {
      setRespondingId(null);
    }
  };

  const handleCopyLink = async (inv: PatientInvitation) => {
    const link = getPatientActivationUrl(inv.token, inv.patient_email);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.from('patient_invitations').delete().eq('id', inviteId);
    if (!error) {
      setPendingInvitations((prev) => prev.filter((i) => i.id !== inviteId));
      setConfirmDeleteInviteId(null);
    } else {
      setErrorMsg(`Gagal membatalkan undangan: ${error.message}`);
    }
  };

  const filteredPatients = patients.filter((p) => {
    const matchesSearch =
      p.fullName.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.surgery?.surgery_type?.name &&
        p.surgery.surgery_type.name.toLowerCase().includes(search.toLowerCase()));

    const matchedSurgeryDef = matchMvpDefinition(p.surgery?.surgery_type?.name);
    const matchesSurgery =
      selectedSurgeryFilter === 'all' ||
      matchedSurgeryDef?.canonicalName === selectedSurgeryFilter;

    return matchesSearch && matchesSurgery;
  });

  const filteredInvites = pendingInvitations.filter(
    (inv) =>
      inv.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.patient_email.toLowerCase().includes(search.toLowerCase())
  );

  const renderAlertBadge = (highestAlert: string | null) => {
    if (highestAlert === 'darurat') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-rose-100 text-rose-800">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
          DARURAT
        </span>
      );
    }
    if (highestAlert === 'urgent') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-amber-100 text-amber-800">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
          URGENT
        </span>
      );
    }
    if (highestAlert === 'waspada') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-yellow-100 text-yellow-800">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-600" />
          WASPADA
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium text-[10px] bg-emerald-50 text-emerald-700">
        Normal
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Daftar Pasien Pascaoperasi
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Menampilkan pasien aktif terhubung, permintaan pendampingan baru, dan undangan aktivasi.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchPatients()}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onOpenAddPatient}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah / Undang Pasien</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      {rpcNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
          {rpcNotice}
        </div>
      )}

      {/* Incoming Consent Requests from Patients */}
      {pendingConsentIncoming.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-teal-500 overflow-hidden shadow-xs">
          <div className="p-4 bg-teal-50 border-b border-teal-200 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-teal-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-900">
              Permintaan Pendampingan Masuk dari Pasien ({pendingConsentIncoming.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingConsentIncoming.map((rel) => (
              <div
                key={rel.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm">{rel.counterpart_name}</div>
                  <div className="text-slate-600">
                    {rel.counterpart_email}
                    {rel.notes ? ` · Catatan: "${rel.notes}"` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={respondingId === rel.id}
                    onClick={() => handleRespondConsent(rel.id, false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-semibold rounded-lg inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Tolak</span>
                  </button>
                  <button
                    type="button"
                    disabled={respondingId === rel.id}
                    onClick={() => handleRespondConsent(rel.id, true)}
                    className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{respondingId === rel.id ? 'Memproses...' : 'Terima & Dampingi'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari berdasarkan nama, email, atau jenis operasi..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-teal-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedSurgeryFilter}
            onChange={(e) => setSelectedSurgeryFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">Semua Jenis Operasi (7 MVP)</option>
            {MVP_SURGERY_DEFINITIONS.map((def) => (
              <option key={def.code} value={def.canonicalName}>
                {def.canonicalName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Patients */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600 mb-2" />
            <span>Mengambil data pasien dari Supabase...</span>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-3">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">Belum ada pasien aktif yang cocok</p>
            <p className="text-slate-400 max-w-sm mx-auto">
              Pasien yang diundang akan otomatis masuk ke daftar aktif setelah mengaktifkan akun atau menyetujui penautan.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredPatients.map((p) => (
                <div key={p.id} className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{p.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {p.gender === 'L' ? 'Laki-laki' : p.gender === 'P' ? 'Perempuan' : '-'} · {p.age}
                      </div>
                    </div>
                    {renderAlertBadge(p.highestAlert)}
                  </div>
                  <div className="text-slate-700 font-medium">
                    {p.surgery?.surgery_type?.name || 'Pasca Operasi'}
                  </div>
                  {p.latestVital ? (
                    <div className="text-[11px] text-slate-600 tabular-nums">
                      TD {p.latestVital.systolic_bp}/{p.latestVital.diastolic_bp} · Suhu {p.latestVital.body_temperature}°C · SpO2 {p.latestVital.oxygen_saturation}%
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">Belum ada laporan vital</div>
                  )}
                  <button
                    onClick={() => onSelectPatient(p.id)}
                    className="w-full py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold rounded-lg inline-flex items-center justify-center gap-1.5"
                  >
                    <span>Lihat Asuhan Pasien</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Nama & Umur</th>
                    <th className="py-3 px-4">Tindakan Operasi</th>
                    <th className="py-3 px-4">Tanggal Op / Pulang</th>
                    <th className="py-3 px-4">Laporan Terakhir</th>
                    <th className="py-3 px-4">Status Peringatan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPatients.map((p) => {
                    const surgeryName = p.surgery?.surgery_type?.name || 'Pasca Operasi';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{p.fullName}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span>{p.gender === 'L' ? 'Laki-laki' : p.gender === 'P' ? 'Perempuan' : '-'}</span>
                            <span>·</span>
                            <span className="tabular-nums">{p.age}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-800">{surgeryName}</span>
                          {p.surgery?.surgeon_name && (
                            <div className="text-[11px] text-slate-500">{p.surgery.surgeon_name}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[11px] tabular-nums">
                          <div>
                            Op: <strong className="text-slate-800">{p.surgery?.surgery_date ? formatLocalDate(p.surgery.surgery_date) : '-'}</strong>
                          </div>
                          <div className="text-slate-500">
                            Pulang: {p.surgery?.discharge_date ? formatLocalDate(p.surgery.discharge_date) : '-'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[11px]">
                          {p.latestVital ? (
                            <div className="space-y-0.5 tabular-nums">
                              <div className="font-medium text-slate-800">
                                TD {p.latestVital.systolic_bp}/{p.latestVital.diastolic_bp} mmHg · {p.latestVital.body_temperature}°C
                              </div>
                              <div className="text-slate-500">
                                {new Date(p.latestVital.recorded_at).toLocaleDateString('id-ID')}{' '}
                                {new Date(p.latestVital.recorded_at).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Belum melapor</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">{renderAlertBadge(p.highestAlert)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => onSelectPatient(p.id)}
                            className="px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                          >
                            <span>Lihat Asuhan</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Outgoing Nurse Link Requests awaiting Patient Approval */}
      {pendingConsentOutgoing.length > 0 && (
        <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
          <div className="p-4 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-950">
              Menunggu Persetujuan Pasien ({pendingConsentOutgoing.length})
            </h2>
          </div>
          <div className="divide-y divide-blue-100">
            {pendingConsentOutgoing.map((rel) => (
              <div
                key={rel.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">{rel.counterpart_name}</div>
                  <div className="text-slate-600">{rel.counterpart_email} · Menunggu konfirmasi dari portal pasien</div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {confirmCancelReqId === rel.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelReqId(null)}
                        className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={respondingId === rel.id}
                        onClick={() => handleCancelOutgoingRequest(rel.id)}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg"
                      >
                        Konfirmasi Batalkan
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelReqId(rel.id)}
                      className="px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 font-semibold rounded-lg"
                    >
                      Batalkan Permintaan
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Invitations Panel */}
      {filteredInvites.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MailCheck className="w-4 h-4 text-amber-700" />
              <h2 className="text-sm font-bold text-amber-950">
                Pasien Diundang (Menunggu Aktivasi) — {filteredInvites.length}
              </h2>
            </div>
          </div>
          <div className="divide-y divide-amber-100">
            {filteredInvites.map((inv) => (
              <div
                key={inv.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">{inv.patient_name}</div>
                  <div className="text-slate-600 flex flex-wrap items-center gap-2">
                    <span>{inv.patient_email}</span>
                    <span>· Kode: <strong className="font-mono text-teal-700">{inv.token}</strong></span>
                    {inv.surgery_date && (
                      <span>· Tgl Op: {formatLocalDate(inv.surgery_date)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleCopyLink(inv)}
                    className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    {copiedId === inv.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Link Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Link Aktivasi</span>
                      </>
                    )}
                  </button>
                  {confirmDeleteInviteId === inv.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteInviteId(null)}
                        className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInvite(inv.id)}
                        className="px-2.5 py-1 bg-rose-600 text-white font-semibold rounded-lg"
                      >
                        Hapus
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteInviteId(inv.id)}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Batalkan undangan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
