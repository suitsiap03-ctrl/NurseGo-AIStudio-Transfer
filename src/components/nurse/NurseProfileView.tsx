/**
 * Nurse Profile View in NurseGo
 *
 * - Displays & edits nurse credentials, education qualification, Ners profession status,
 *   academic degree, automatic professional title preview, STR details & facility info
 * - Real STR / Ijazah document upload & signed URL download via Supabase Storage (`nurse-documents`)
 * - Distinct verification status badges ('verified', 'pending', 'needs_revision', 'unverified')
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { formatLocalDate } from '../../lib/dateUtils';
import { normalizePersonName } from '../../lib/nameUtils';
import { NurseEducationLevel } from '../../types/database';
import { PasswordInput } from '../common/PasswordInput';
import {
  User,
  ShieldCheck,
  Clock,
  Hospital,
  FileText,
  Mail,
  LogOut,
  Phone,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Lock,
  GraduationCap,
  UploadCloud,
  ExternalLink,
} from 'lucide-react';

const EDUCATION_LABELS: Record<NurseEducationLevel, string> = {
  d3_keperawatan: 'D3 Keperawatan (A.Md.Kep.)',
  s1_keperawatan: 'S1 Keperawatan (S.Kep.)',
  s2_keperawatan: 'S2 Keperawatan (M.Kep.)',
  s2_kesehatan_lain: 'S2 Kesehatan Lainnya (M.Kes.)',
  s3_keperawatan: 'S3 Keperawatan (Dr.Kep.)',
  s3_kesehatan_lain: 'S3 Kesehatan Lainnya (Ph.D.)',
  spesialis_keperawatan: 'Spesialis Keperawatan (Sp.Kep.)',
};

export const NurseProfileView: React.FC = () => {
  const { user, profile, nurseProfile, isDemoMode, signOut, refreshProfile, updatePassword } =
    useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [educationLevel, setEducationLevel] = useState<NurseEducationLevel>('s1_keperawatan');
  const [hasNersProfession, setHasNersProfession] = useState<boolean>(true);
  const [academicDegree, setAcademicDegree] = useState('');
  const [phone, setPhone] = useState('');
  const [strNumber, setStrNumber] = useState('');
  const [strExpiryDate, setStrExpiryDate] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Storage document uploads & signed URLs
  const [uploadingDoc, setUploadingDoc] = useState<'str' | 'diploma' | null>(null);
  const [strSignedUrl, setStrSignedUrl] = useState<string | null>(null);
  const [diplomaSignedUrl, setDiplomaSignedUrl] = useState<string | null>(null);
  const strFileRef = useRef<HTMLInputElement>(null);
  const diplomaFileRef = useRef<HTMLInputElement>(null);

  // Password change state
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
    setProfessionalTitle(nurseProfile?.professional_title || '');
    setEducationLevel(nurseProfile?.education_level || 's1_keperawatan');
    setHasNersProfession(Boolean(nurseProfile?.has_ners_profession));
    setAcademicDegree(nurseProfile?.academic_degree || '');
    setStrNumber(nurseProfile?.str_number || '');
    setStrExpiryDate(nurseProfile?.str_expiry_date || '');
    setHospitalName(nurseProfile?.hospital_name || '');
    setDepartment(nurseProfile?.department || '');
  }, [profile, nurseProfile]);

  useEffect(() => {
    if (isDemoMode || !nurseProfile) {
      setStrSignedUrl(null);
      setDiplomaSignedUrl(null);
      return;
    }

    const loadSignedUrls = async () => {
      const supabase = getSupabase();
      if (nurseProfile.str_document_url) {
        const { data, error } = await supabase.storage
          .from('nurse-documents')
          .createSignedUrl(nurseProfile.str_document_url, 600);
        if (error) console.warn('STR signed URL notice:', error.message);
        setStrSignedUrl(data?.signedUrl || null);
      } else {
        setStrSignedUrl(null);
      }
      if (nurseProfile.diploma_document_url) {
        const { data, error } = await supabase.storage
          .from('nurse-documents')
          .createSignedUrl(nurseProfile.diploma_document_url, 600);
        if (error) console.warn('Diploma signed URL notice:', error.message);
        setDiplomaSignedUrl(data?.signedUrl || null);
      } else {
        setDiplomaSignedUrl(null);
      }
    };
    loadSignedUrls();
  }, [nurseProfile, isDemoMode]);

  const generateDefaultSuffix = (lvl: NurseEducationLevel, hasNers: boolean): string => {
    switch (lvl) {
      case 'd3_keperawatan':
        return 'A.Md.Kep.';
      case 's1_keperawatan':
        return 'S.Kep.';
      case 's2_keperawatan':
        return hasNers ? 'S.Kep., M.Kep.' : 'M.Kep.';
      case 's2_kesehatan_lain':
        return hasNers ? 'S.Kep., M.Kes.' : 'M.Kes.';
      case 's3_keperawatan':
        return hasNers ? 'S.Kep., Dr.Kep.' : 'Dr.';
      case 's3_kesehatan_lain':
        return hasNers ? 'S.Kep., Ph.D.' : 'Ph.D.';
      case 'spesialis_keperawatan':
        return 'S.Kep., Sp.Kep.MB';
      default:
        return 'S.Kep.';
    }
  };

  const applyAutoTitle = (nameVal: string, lvl: NurseEducationLevel, hasNers: boolean, degVal: string) => {
    const suffix = degVal.trim() || generateDefaultSuffix(lvl, hasNers);
    const prefix = hasNers ? 'Ns. ' : '';
    return `${prefix}${normalizePersonName(nameVal) || 'Perawat'}, ${suffix}`;
  };

  const handleUploadDocument = async (docType: 'str' | 'diploma', file: File | null) => {
    if (!file || !user) return;
    if (isDemoMode) {
      setFeedback({ type: 'error', text: 'Mode Demo tidak mendukung unggah berkas ke Supabase Storage.' });
      return;
    }

    setUploadingDoc(docType);
    setFeedback(null);
    const supabase = getSupabase();
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${user.id}/${docType}_${Date.now()}_${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from('nurse-documents')
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        throw new Error(
          uploadErr.message.includes('Bucket not found')
            ? 'Bucket Storage `nurse-documents` belum dibuat di Supabase. Jalankan migrasi 002.'
            : `Gagal mengunggah dokumen: ${uploadErr.message}`
        );
      }

      const column = docType === 'str' ? 'str_document_url' : 'diploma_document_url';
      const { error: dbErr } = nurseProfile?.id
        ? await supabase
            .from('nurse_profiles')
            .update({ [column]: path })
            .eq('id', user.id)
        : await supabase.from('nurse_profiles').upsert({
            id: user.id,
            str_number: nurseProfile?.str_number || strNumber.trim() || '',
            [column]: path,
          });

      if (dbErr) throw dbErr;

      await refreshProfile();
      setFeedback({
        type: 'success',
        text: `Dokumen ${docType === 'str' ? 'STR Perawat' : 'Ijazah / Sertifikat'} berhasil diunggah dan tersimpan.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Gagal mengunggah dokumen.' });
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFeedback(null);

    if (isDemoMode) {
      setFeedback({
        type: 'error',
        text: 'Mode Demo tidak menyimpan perubahan ke database permanen. Masuk dengan akun asli untuk mengubah profil.',
      });
      return;
    }

    const normalizedName = normalizePersonName(fullName);
    if (!normalizedName || !strNumber.trim()) {
      setFeedback({ type: 'error', text: 'Nama lengkap dan Nomor STR wajib diisi.' });
      return;
    }
    setFullName(normalizedName);

    setSaving(true);
    const supabase = getSupabase();
    try {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: normalizedName,
          phone: phone.trim() || null,
        })
        .eq('id', user.id);

      if (profErr) {
        setFeedback({ type: 'error', text: `Gagal memperbarui profil: ${profErr.message}` });
        return;
      }

      const computedDegree = academicDegree.trim() || generateDefaultSuffix(educationLevel, hasNersProfession);
      const computedTitle =
        professionalTitle.trim() || applyAutoTitle(normalizedName, educationLevel, hasNersProfession, computedDegree);

      const nurseFields = {
        str_number: strNumber.trim(),
        str_expiry_date: strExpiryDate || null,
        education_level: educationLevel,
        has_ners_profession: hasNersProfession,
        academic_degree: computedDegree,
        professional_title: computedTitle,
        hospital_name: hospitalName.trim() || null,
        department: department.trim() || null,
      };

      const { error: nurseErr } = nurseProfile?.id
        ? await supabase
            .from('nurse_profiles')
            .update(nurseFields)
            .eq('id', user.id)
        : await supabase.from('nurse_profiles').upsert({
            id: user.id,
            ...nurseFields,
            verification_status: 'pending',
          });

      if (nurseErr) {
        setFeedback({ type: 'error', text: `Gagal memperbarui data STR: ${nurseErr.message}` });
        return;
      }

      await refreshProfile();
      setIsEditing(false);
      setFeedback({ type: 'success', text: 'Profil, kualifikasi & kredensial perawat berhasil diperbarui.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Terjadi kesalahan saat menyimpan.' });
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
        setPassFeedback({ type: 'success', text: 'Kata sandi akun berhasil diperbarui.' });
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPassFeedback({ type: 'error', text: res.error || 'Gagal memperbarui kata sandi.' });
      }
    } finally {
      setChangingPass(false);
    }
  };

  const status = nurseProfile?.verification_status || 'pending';
  const displayName = nurseProfile?.professional_title || profile?.full_name || 'Perawat';

  const renderStatusBadge = () => {
    if (status === 'verified') {
      return (
        <span className="self-center sm:self-auto px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          <span>STR Terverifikasi</span>
        </span>
      );
    }
    if (status === 'needs_revision') {
      return (
        <span className="self-center sm:self-auto px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          <span>Perlu Perbaikan Dokumen</span>
        </span>
      );
    }
    if (status === 'unverified') {
      return (
        <span className="self-center sm:self-auto px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Belum Terverifikasi</span>
        </span>
      );
    }
    return (
      <span className="self-center sm:self-auto px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
        <Clock className="w-3 h-3" />
        <span>Verifikasi STR Pending</span>
      </span>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-2xl font-bold shadow-xs shrink-0">
            {(profile?.full_name?.[0] || 'N').toUpperCase()}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{displayName}</h1>
              {renderStatusBadge()}
            </div>

            <p className="text-xs text-slate-500">
              Perawat Penanggung Jawab Asuhan Pascaoperasi
            </p>
          </div>

          {!isEditing && (
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setIsEditing(true);
              }}
              className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profil</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Detail / Edit Credential Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 text-xs">
        <h2 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-2 border-b border-slate-100">
          Kredensial & Kualifikasi Profesional Perawat
        </h2>

        {isEditing ? (
          <form onSubmit={handleSaveProfile} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap (Tanpa Gelar) *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => setFullName((prev) => normalizePersonName(prev))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pendidikan Terakhir
                </label>
                <select
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value as NurseEducationLevel)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                >
                  {Object.entries(EDUCATION_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Status Profesi Ners
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHasNersProfession(true)}
                    className={`flex-1 py-2 px-3 rounded-lg border font-semibold ${
                      hasNersProfession
                        ? 'bg-teal-50 border-teal-500 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Profesi Ners (Ns.)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasNersProfession(false)}
                    className={`flex-1 py-2 px-3 rounded-lg border font-semibold ${
                      !hasNersProfession
                        ? 'bg-teal-50 border-teal-500 text-teal-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Non-Ners
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Gelar Akademik (Akhiran)
                </label>
                <input
                  type="text"
                  value={academicDegree}
                  onChange={(e) => setAcademicDegree(e.target.value)}
                  placeholder={generateDefaultSuffix(educationLevel, hasNersProfession)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Nama Tampilan + Gelar Profesi
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setProfessionalTitle(
                        applyAutoTitle(fullName, educationLevel, hasNersProfession, academicDegree)
                      )
                    }
                    className="text-[11px] font-semibold text-teal-700 hover:underline"
                  >
                    Bentuk Otomatis
                  </button>
                </div>
                <input
                  type="text"
                  value={professionalTitle}
                  onChange={(e) => setProfessionalTitle(e.target.value)}
                  placeholder="Ns. Rina Kartika, S.Kep."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor STR Perawat *
                </label>
                <input
                  type="text"
                  required
                  value={strNumber}
                  onChange={(e) => setStrNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Masa Berlaku STR
                </label>
                <input
                  type="date"
                  value={strExpiryDate}
                  onChange={(e) => setStrExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Rumah Sakit / Faskes Mitra
                </label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Unit / Departemen</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-600" />
                <span>Nomor STR Perawat</span>
              </span>
              <div className="font-mono font-bold text-slate-900 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                {nurseProfile?.str_number || '-'}
              </div>
              {nurseProfile?.str_expiry_date && (
                <span className="text-[11px] text-slate-500 block">
                  Berlaku s.d. {formatLocalDate(nurseProfile.str_expiry_date)}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-teal-600" />
                <span>Email Resmi</span>
              </span>
              <div className="font-medium text-slate-900 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200 truncate">
                {user?.email || profile?.email || '-'}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-teal-600" />
                <span>Nomor Telepon</span>
              </span>
              <div className="font-mono font-medium text-slate-900 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                {profile?.phone || '-'}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                <span>Kualifikasi Pendidikan</span>
              </span>
              <div className="font-medium text-slate-900 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                {nurseProfile?.education_level
                  ? EDUCATION_LABELS[nurseProfile.education_level] || nurseProfile.education_level
                  : '-'}
                {nurseProfile?.has_ners_profession ? ' · Profesi Ners' : ''}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <Hospital className="w-3.5 h-3.5 text-teal-600" />
                <span>Rumah Sakit / Faskes Mitra</span>
              </span>
              <div className="font-medium text-slate-900 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                {nurseProfile?.hospital_name || '-'}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-600" />
                <span>Unit / Departemen</span>
              </span>
              <div className="font-medium text-slate-900 text-sm bg-slate-50 p-2 rounded-lg border border-slate-200">
                {nurseProfile?.department || '-'}
              </div>
            </div>
          </div>
        )}

        {/* Document Upload & Preview (STR & Ijazah) */}
        {!isDemoMode && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              Berkas Verifikasi STR & Ijazah (Supabase Storage)
            </div>
            <input
              ref={strFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => handleUploadDocument('str', e.target.files?.[0] || null)}
            />
            <input
              ref={diplomaFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => handleUploadDocument('diploma', e.target.files?.[0] || null)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Dokumen STR</span>
                  {nurseProfile?.str_document_url ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Tersimpan
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold">
                      Belum Ada
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingDoc === 'str'}
                    onClick={() => strFileRef.current?.click()}
                    className="flex-1 py-1.5 px-2.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-teal-600" />
                    <span>{uploadingDoc === 'str' ? 'Mengunggah...' : 'Unggah STR'}</span>
                  </button>
                  {strSignedUrl && (
                    <a
                      href={strSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-2.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-teal-100"
                    >
                      <span>Lihat</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Ijazah / Sertifikat Ners</span>
                  {nurseProfile?.diploma_document_url ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Tersimpan
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold">
                      Belum Ada
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingDoc === 'diploma'}
                    onClick={() => diplomaFileRef.current?.click()}
                    className="flex-1 py-1.5 px-2.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-teal-600" />
                    <span>{uploadingDoc === 'diploma' ? 'Mengunggah...' : 'Unggah Ijazah'}</span>
                  </button>
                  {diplomaSignedUrl && (
                    <a
                      href={diplomaSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-2.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-semibold inline-flex items-center gap-1 hover:bg-teal-100"
                    >
                      <span>Lihat</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Auth UID: <code className="font-mono text-slate-600">{user?.id}</code>
          </span>
        </div>
      </div>

      {/* Password Change Section */}
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

      {/* System Settings & Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
          Pengaturan Sistem & Akun
        </h2>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => signOut()}
            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar dari Aplikasi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
