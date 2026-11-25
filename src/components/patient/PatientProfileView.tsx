/**
 * Patient Profile View for NurseGo
 * Displays & allows editing of patient identity, emergency contacts, medical history, allergies,
 * surgery summary, multi-nurse team + mutual consent relationship management, and password change
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { DEMO_NURSE } from '../../data/mockData';
import { formatLocalDate } from '../../lib/dateUtils';
import { normalizePersonName } from '../../lib/nameUtils';
import { RelationshipSummary } from '../../types/database';
import { PasswordInput } from '../common/PasswordInput';
import {
  LogOut,
  CheckCircle2,
  AlertCircle,
  Lock,
  UserCheck,
  Stethoscope,
  Users,
  UserPlus,
  UserX,
  Check,
  X,
  Send,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export const PatientProfileView: React.FC = () => {
  const {
    user,
    profile,
    patientProfile,
    patientSurgery,
    isDemoMode,
    signOut,
    refreshProfile,
    updatePassword,
  } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'L' | 'P' | ''>('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [address, setAddress] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [allergies, setAllergies] = useState('');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Multi-nurse relationships & consent management
  const [relationships, setRelationships] = useState<RelationshipSummary[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [teamNotice, setTeamNotice] = useState<string | null>(null);
  const [teamFeedback, setTeamFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [inviteNurseEmail, setInviteNurseEmail] = useState('');
  const [inviteNotes, setInviteNotes] = useState('');
  const [invitingNurse, setInvitingNurse] = useState(false);
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [processingRelId, setProcessingRelId] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [passFeedback, setPassFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name || '');
    setPhone(profile?.phone || '');
    setDateOfBirth(patientProfile?.date_of_birth || '');
    setGender((patientProfile?.gender as 'L' | 'P') || '');
    setEmergencyName(patientProfile?.emergency_contact_name || '');
    setEmergencyPhone(patientProfile?.emergency_contact_phone || '');
    setAddress(patientProfile?.address || '');
    setMedicalHistory(patientProfile?.medical_history || '');
    setAllergies(patientProfile?.allergies || '');
  }, [profile, patientProfile]);

  const loadRelationships = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      setRelationships([
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
      setTeamNotice(null);
      setTeamFeedback(null);
      setLoadingTeam(false);
      return;
    }

    setLoadingTeam(true);
    setTeamNotice(null);
    const supabase = getSupabase();
    try {
      const { data: relData, error: relErr } = await supabase.rpc(
        'get_my_nurse_patient_relationships'
      );

      if (!relErr && Array.isArray(relData)) {
        setRelationships(relData as RelationshipSummary[]);
      } else {
        if (relErr) {
          setTeamNotice(
            isMissingRpcError(relErr)
              ? 'Fungsi backend persetujuan multi-perawat (`004_live_sync_consent_rpcs_and_mvp.sql`) belum diterapkan di Supabase. Fitur undangan perawat tambahan dan persetujuan penautan belum tersedia hingga migrasi dijalankan.'
              : `Fungsi relasi tim perawat gagal dimuat (${relErr.message}).`
          );
        }
        const { data: assigns, error: assignErr } = await supabase
          .from('patient_nurse_assignments')
          .select('id, patient_id, nurse_id, is_active, relationship_role, assigned_at')
          .eq('patient_id', user.id)
          .eq('is_active', true)
          .eq('status', 'active')
          .is('ended_at', null);

        if (assignErr) {
          setTeamFeedback({
            type: 'error',
            text: `Gagal memuat daftar perawat: ${assignErr.message}`,
          });
          setRelationships([]);
        } else if (assigns && assigns.length > 0) {
          const nurseIds = assigns.map((a: any) => a.nurse_id);
          const [{ data: nProfs }, { data: nDets }] = await Promise.all([
            supabase.from('profiles').select('id, full_name, email, phone').in('id', nurseIds),
            supabase
              .from('nurse_profiles')
              .select('id, professional_title, hospital_name, department, verification_status')
              .in('id', nurseIds),
          ]);
          const profMap = new Map((nProfs || []).map((p: any) => [p.id, p]));
          const detMap = new Map((nDets || []).map((d: any) => [d.id, d]));

          setRelationships(
            assigns.map((a: any) => {
              const p = profMap.get(a.nurse_id) || {};
              const d = detMap.get(a.nurse_id) || {};
              return {
                id: a.id,
                patient_id: a.patient_id,
                nurse_id: a.nurse_id,
                is_active: true,
                status: 'active',
                relationship_role: a.relationship_role || 'perawat_penanggung_jawab',
                assigned_at: a.assigned_at,
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
          setRelationships([]);
        }
      }
    } catch (err: any) {
      setTeamFeedback({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat memuat tim perawat.',
      });
    } finally {
      setLoadingTeam(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  useRealtimeSubscription(
    `patient-team-${user?.id || 'anon'}`,
    user && !isDemoMode
      ? [{ table: 'patient_nurse_assignments', filter: `patient_id=eq.${user.id}` }]
      : [],
    loadRelationships,
    Boolean(user && !isDemoMode)
  );

  const handleInviteAdditionalNurse = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamFeedback(null);
    const trimmedEmail = inviteNurseEmail.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setTeamFeedback({ type: 'error', text: 'Masukkan alamat email perawat yang valid.' });
      return;
    }

    if (isDemoMode) {
      setTeamFeedback({
        type: 'error',
        text: 'Mode Demo tidak mendukung pengiriman undangan perawat tambahan.',
      });
      return;
    }

    setInvitingNurse(true);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('patient_invite_additional_nurse', {
        p_nurse_email: trimmedEmail,
        p_notes: inviteNotes.trim() || null,
      });

      if (error) {
        setTeamFeedback({
          type: 'error',
          text: isMissingRpcError(error)
            ? 'Fungsi undangan perawat tambahan (`patient_invite_additional_nurse`) belum tersedia di Supabase. Jalankan migrasi SQL `004_live_sync_consent_rpcs_and_mvp.sql` terlebih dahulu.'
            : error.message,
        });
        return;
      }

      if (!data?.success) {
        setTeamFeedback({
          type: 'error',
          text: data?.reason || 'Gagal mengirim undangan ke perawat tersebut.',
        });
        return;
      }

      setInviteNurseEmail('');
      setInviteNotes('');
      setTeamFeedback({
        type: 'success',
        text: `Undangan pendampingan dikirim ke ${data.nurse_name || trimmedEmail}. Hubungan akan aktif setelah perawat menyetujuinya.`,
      });
      await loadRelationships();
    } catch (err: any) {
      setTeamFeedback({ type: 'error', text: err?.message || 'Gagal mengundang perawat.' });
    } finally {
      setInvitingNurse(false);
    }
  };

  const handleRespondRelationship = async (assignmentId: string, accept: boolean) => {
    if (isDemoMode) return;
    setTeamFeedback(null);
    setProcessingRelId(assignmentId);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('respond_nurse_patient_assignment', {
        p_assignment_id: assignmentId,
        p_accept: accept,
      });

      if (error) {
        setTeamFeedback({
          type: 'error',
          text: isMissingRpcError(error)
            ? 'Fungsi `respond_nurse_patient_assignment` belum tersedia di Supabase. Jalankan migrasi SQL `004_live_sync_consent_rpcs_and_mvp.sql` terlebih dahulu.'
            : error.message,
        });
        return;
      }
      if (!data?.success) {
        setTeamFeedback({ type: 'error', text: data?.reason || 'Gagal memproses persetujuan.' });
        return;
      }

      setTeamFeedback({
        type: 'success',
        text: accept
          ? 'Permintaan perawat disetujui. Perawat kini terhubung dengan akun Anda.'
          : 'Permintaan penautan perawat ditolak.',
      });
      await loadRelationships();
    } finally {
      setProcessingRelId(null);
    }
  };

  const handleEndRelationship = async (assignmentId: string, isCancelPending = false) => {
    if (isDemoMode || !user) return;
    setTeamFeedback(null);
    setProcessingRelId(assignmentId);
    const supabase = getSupabase();
    try {
      const { data, error } = await supabase.rpc('end_nurse_patient_assignment', {
        p_assignment_id: assignmentId,
      });

      if (error) {
        if (!isMissingRpcError(error)) {
          setTeamFeedback({ type: 'error', text: error.message });
          return;
        }
        // Direct RLS-compliant update fallback only when RPC is not yet deployed
        const { error: updErr } = await supabase
          .from('patient_nurse_assignments')
          .update({ is_active: false, status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', assignmentId)
          .eq('patient_id', user.id);

        if (updErr) {
          setTeamFeedback({
            type: 'error',
            text: `Fungsi \`end_nurse_patient_assignment\` belum terpasang di Supabase dan pembaruan langsung ditolak (${updErr.message}). Jalankan migrasi SQL \`004_live_sync_consent_rpcs_and_mvp.sql\`.`,
          });
          return;
        }
      } else if (data && !data.success) {
        setTeamFeedback({ type: 'error', text: data.reason || 'Gagal mengakhiri hubungan.' });
        return;
      }

      setConfirmEndId(null);
      setTeamFeedback({
        type: 'success',
        text: isCancelPending
          ? 'Undangan perawat dibatalkan.'
          : 'Hubungan pemantauan dengan perawat telah diakhiri.',
      });
      await loadRelationships();
    } finally {
      setProcessingRelId(null);
    }
  };

  const activeNurses = relationships.filter((r) => r.is_active && r.status === 'active' && !r.ended_at);
  const incomingRequests = relationships.filter((r) => r.status === 'pending_patient' && !r.ended_at);
  const outgoingInvites = relationships.filter((r) => r.status === 'pending_nurse' && !r.ended_at);

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFeedback(null);

    if (isDemoMode) {
      setFeedback({
        type: 'error',
        text: 'Mode Demo tidak menyimpan perubahan ke database permanen.',
      });
      return;
    }

    const normalizedFullName = normalizePersonName(fullName);
    const normalizedEmergencyName = normalizePersonName(emergencyName);
    setFullName(normalizedFullName);
    setEmergencyName(normalizedEmergencyName);

    setSaving(true);
    const supabase = getSupabase();
    try {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: normalizedFullName || profile?.full_name,
          phone: phone.trim() || null,
        })
        .eq('id', user.id);

      if (profErr) {
        setFeedback({ type: 'error', text: `Gagal memperbarui profil: ${profErr.message}` });
        return;
      }

      const { error: patErr } = await supabase.from('patient_profiles').upsert({
        id: user.id,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        emergency_contact_name: normalizedEmergencyName || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        address: address.trim() || null,
        medical_history: medicalHistory.trim() || null,
        allergies: allergies.trim() || null,
      });

      if (patErr) {
        setFeedback({ type: 'error', text: `Gagal menyimpan detail pasien: ${patErr.message}` });
        return;
      }

      await refreshProfile();
      setFeedback({ type: 'success', text: 'Data profil & kontak darurat berhasil diperbarui.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Gagal menyimpan perubahan.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassFeedback(null);
    if (newPassword.length < 6) {
      setPassFeedback({ type: 'error', text: 'Kata sandi baru minimal 6 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassFeedback({ type: 'error', text: 'Konfirmasi kata sandi tidak cocok.' });
      return;
    }

    setChangingPass(true);
    try {
      const res = await updatePassword(newPassword);
      if (res.success) {
        setPassFeedback({ type: 'success', text: 'Kata sandi berhasil diperbarui.' });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPassFeedback({ type: 'error', text: res.error || 'Gagal memperbarui kata sandi.' });
      }
    } finally {
      setChangingPass(false);
    }
  };

  const primaryNurse = activeNurses[0] || null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* Header Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-2xl font-bold shadow-xs shrink-0">
            {profile?.full_name ? profile.full_name[0].toUpperCase() : 'P'}
          </div>

          <div className="flex-1 space-y-1">
            <h1 className="text-lg font-bold text-slate-900">
              {profile?.full_name || 'Pasien NurseGo'}
            </h1>
            <p className="text-xs text-slate-500">Pasien Pascaoperasi · {user?.email}</p>
            {patientSurgery?.surgery_type?.name && (
              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 mt-1">
                Tindakan: {patientSurgery.surgery_type.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Assigned Nurse & Surgery Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1">
          <span className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Perawat Utama ({activeNurses.length} Aktif)</span>
          </span>
          <p className="font-bold text-slate-900 text-sm">
            {primaryNurse
              ? primaryNurse.professional_title || primaryNurse.counterpart_name
              : 'Belum terhubung'}
          </p>
          <p className="text-slate-500">
            {primaryNurse?.hospital_name || '-'}
            {primaryNurse?.counterpart_email ? ` · ${primaryNurse.counterpart_email}` : ''}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1">
          <span className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
            <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
            <span>Ringkasan Operasi</span>
          </span>
          <p className="font-bold text-slate-900 text-sm">
            {patientSurgery?.surgery_type?.name || 'Belum tercatat'}
          </p>
          <p className="text-slate-500">
            {patientSurgery?.surgery_date
              ? `Tanggal: ${formatLocalDate(patientSurgery.surgery_date)}`
              : 'Tanggal operasi belum diisi perawat'}
            {patientSurgery?.hospital_name ? ` · ${patientSurgery.hospital_name}` : ''}
          </p>
        </div>
      </div>

      {/* Multi-Nurse Team & Consent Management */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 text-xs">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-teal-600" />
              <span>Tim Perawat & Manajemen Hubungan</span>
            </h2>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Anda dapat terhubung dengan lebih dari satu perawat. Penautan baru memerlukan
              persetujuan bersama sebelum perawat mengakses data klinis Anda.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRelationships}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
            title="Muat ulang tim perawat"
          >
            <RefreshCw className={`w-4 h-4 ${loadingTeam ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {teamNotice && (
          <div className="p-3 rounded-lg border bg-amber-50 border-amber-200 text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{teamNotice}</span>
          </div>
        )}

        {teamFeedback && (
          <div
            className={`p-3 rounded-lg border flex items-center gap-2 ${
              teamFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {teamFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{teamFeedback.text}</span>
          </div>
        )}

        {/* Incoming Requests from Nurses needing Patient Consent */}
        {incomingRequests.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Permintaan Masuk dari Perawat ({incomingRequests.length})
            </h3>
            <div className="space-y-2">
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">
                      {req.professional_title || req.counterpart_name}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {req.counterpart_email}
                      {req.hospital_name ? ` · ${req.hospital_name}` : ''}
                    </div>
                    {req.notes && (
                      <div className="text-[11px] text-amber-900 bg-white/80 px-2 py-1 rounded mt-1">
                        Catatan: {req.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={processingRelId === req.id}
                      onClick={() => handleRespondRelationship(req.id, true)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Setujui</span>
                    </button>
                    <button
                      type="button"
                      disabled={processingRelId === req.id}
                      onClick={() => handleRespondRelationship(req.id, false)}
                      className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Nurses */}
        <div className="space-y-2.5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Perawat Aktif Terhubung ({activeNurses.length})
          </h3>
          {activeNurses.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">
              Belum ada perawat aktif yang terhubung. Anda dapat mengundang perawat pendamping di
              bawah ini.
            </div>
          ) : (
            <div className="space-y-2">
              {activeNurses.map((nurse) => (
                <div
                  key={nurse.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-bold text-slate-900">
                        {nurse.professional_title || nurse.counterpart_name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-semibold">
                        {nurse.relationship_role === 'perawat_pendamping'
                          ? 'Perawat Pendamping'
                          : 'Perawat Penanggung Jawab'}
                      </span>
                      {nurse.verification_status === 'verified' && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          STR Terverifikasi
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {nurse.hospital_name || 'Faskes Mitra'}
                      {nurse.department ? ` (${nurse.department})` : ''} · {nurse.counterpart_email}
                    </div>
                  </div>

                  {!isDemoMode && (
                    <div className="shrink-0">
                      {confirmEndId === nurse.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={processingRelId === nurse.id}
                            onClick={() => handleEndRelationship(nurse.id, false)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-[11px]"
                          >
                            Ya, Akhiri
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmEndId(null)}
                            className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium text-[11px]"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmEndId(nurse.id)}
                          className="px-3 py-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg font-semibold inline-flex items-center gap-1 text-[11px]"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Akhiri Hubungan</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outgoing Invitations sent by Patient */}
        {outgoingInvites.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Undangan Perawat Tambahan Terkirim ({outgoingInvites.length})
            </h3>
            <div className="space-y-2">
              {outgoingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-slate-800">
                      {inv.professional_title || inv.counterpart_name}
                    </span>
                    <span className="text-slate-500 ml-2">{inv.counterpart_email}</span>
                    <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                      Menunggu Persetujuan Perawat
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={processingRelId === inv.id}
                    onClick={() => handleEndRelationship(inv.id, true)}
                    className="self-start sm:self-center px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                  >
                    Batalkan Undangan
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite Additional Nurse by Exact Email (Zero Directory Exposure) */}
        <form
          onSubmit={handleInviteAdditionalNurse}
          className="bg-teal-50/50 border border-teal-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center gap-2 font-bold text-teal-900">
            <UserPlus className="w-4 h-4 text-teal-600" />
            <span>Undang Perawat Tambahan (Pendamping)</span>
          </div>
          <p className="text-[11px] text-slate-600">
            Masukkan email persis perawat yang terdaftar di NurseGo. Demi privasi tenaga kesehatan,
            sistem tidak menampilkan direktori publik akun perawat.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="email"
              required
              value={inviteNurseEmail}
              onChange={(e) => setInviteNurseEmail(e.target.value)}
              placeholder="email.perawat@klinik.id"
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
            />
            <input
              type="text"
              value={inviteNotes}
              onChange={(e) => setInviteNotes(e.target.value)}
              placeholder="Catatan (opsional, misal: perawat kunjungan rumah)"
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={invitingNurse}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{invitingNurse ? 'Mengirim Undangan...' : 'Kirim Undangan Perawat'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Patient Personal & Emergency Contact Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 text-xs">
        <div className="pb-2 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
            Data Diri, Riwayat Medis & Kontak Darurat
          </h2>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Pastikan kontak keluarga dan riwayat alergi akurat agar perawat dapat merespons cepat.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-lg border flex items-center gap-2 ${
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

        <form onSubmit={handleUpdateContact} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => setFullName((prev) => normalizePersonName(prev))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nomor HP Pasien</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'L' | 'P' | '')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              >
                <option value="">-- Pilih --</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nama Kontak Darurat (Keluarga)
              </label>
              <input
                type="text"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                onBlur={() => setEmergencyName((prev) => normalizePersonName(prev))}
                placeholder="Misal: Ratna Sari (Istri)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nomor Telepon Kontak Darurat
              </label>
              <input
                type="text"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="081234567890"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Alamat Rumah Tempat Pemulihan
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Jl. Sukajadi No. 45, Bandung"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Riwayat Penyakit / Medis
              </label>
              <textarea
                rows={2}
                value={medicalHistory}
                onChange={(e) => setMedicalHistory(e.target.value)}
                placeholder="Misal: Hipertensi terkontrol, Diabetes..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Riwayat Alergi Obat/Makanan</label>
              <textarea
                rows={2}
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Misal: Alergi Amoxicillin / Tidak ada"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold shadow-xs disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
            </button>
          </div>
        </form>
      </div>

      {/* Password Change */}
      {!isDemoMode && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3 text-xs">
          <h2 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-teal-600" />
            <span>Keamanan & Ubah Kata Sandi</span>
          </h2>

          {passFeedback && (
            <div
              className={`p-2.5 rounded-lg border text-xs ${
                passFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {passFeedback.text}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kata sandi baru (min 6)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
            />
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi kata sandi baru"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
            />
            <button
              type="submit"
              disabled={changingPass}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {changingPass ? 'Memperbarui...' : 'Ubah Kata Sandi'}
            </button>
          </form>
        </div>
      )}

      {/* Account Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
          Pengaturan Akun & Status Sistem
        </h2>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => signOut()}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar dari Akun</span>
          </button>
        </div>
      </div>
    </div>
  );
};
