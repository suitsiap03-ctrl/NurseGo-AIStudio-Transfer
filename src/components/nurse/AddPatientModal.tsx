/**
 * Add, Invite & Link Patient Modal for Nurses
 *
 * Explicitly separates two flows:
 * 1. Undang Pasien Baru (`invite` mode - default): Inserts directly into `patient_invitations`
 *    with clinical/surgery metadata and generates a copyable activation token & URL, without
 *    requiring `find_patient_for_nurse_link`.
 * 2. Hubungkan Pasien Terdaftar (`link` mode): Sends a consent-based link request via
 *    `nurse_request_patient_link` (with graceful non-blocking notice if unavailable).
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, isMissingRpcError } from '../../lib/supabaseClient';
import { getPatientActivationUrl } from '../../lib/appUrl';
import { SurgeryType } from '../../types/database';
import {
  FALLBACK_MVP_SURGERY_TYPES,
  filterAndNormalizeMvpSurgeryTypes,
} from '../../lib/surgeryTemplates';
import { getLocalDateInputValue } from '../../lib/dateUtils';
import { normalizePersonName } from '../../lib/nameUtils';
import {
  generateInvitationToken,
  isValidInvitationToken,
  validatePatientModalInput,
} from '../../lib/patientInviteValidation';
import {
  X,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Link2,
  Mail,
  Info,
  Clock,
  UserCheck,
} from 'lucide-react';

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientAdded: () => void;
}

type ModalMode = 'invite' | 'link';

interface GeneratedResult {
  mode: 'pending_consent' | 'invited';
  email: string;
  patientName: string;
  token?: string;
  activationUrl?: string;
  warning?: string;
}

export const AddPatientModal: React.FC<AddPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientAdded,
}) => {
  const { user, isDemoMode } = useAuth();
  const [mode, setMode] = useState<ModalMode>('invite');
  const [surgeryTypes, setSurgeryTypes] = useState<SurgeryType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestSwitchToInvite, setSuggestSwitchToInvite] = useState<boolean>(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [copiedField, setCopiedField] = useState<'token' | 'link' | null>(null);

  // Form fields
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('L');
  const [selectedSurgeryTypeId, setSelectedSurgeryTypeId] = useState<string>('');
  const [surgeryDate, setSurgeryDate] = useState(getLocalDateInputValue());
  const [dischargeDate, setDischargeDate] = useState(getLocalDateInputValue());
  const [surgeonName, setSurgeonName] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchSurgeryTypes = async () => {
      const supabase = getSupabase();
      try {
        const { data, error } = await supabase
          .from('surgery_types')
          .select('*')
          .order('id');

        const normalized = !error ? filterAndNormalizeMvpSurgeryTypes(data as SurgeryType[]) : [];
        if (normalized.length > 0) {
          setSurgeryTypes(normalized);
          setSelectedSurgeryTypeId(String(normalized[0].id));
        } else {
          setSurgeryTypes(FALLBACK_MVP_SURGERY_TYPES);
          setSelectedSurgeryTypeId(String(FALLBACK_MVP_SURGERY_TYPES[0].id));
        }
      } catch (err) {
        console.warn('Error fetching surgery types:', err);
        setSurgeryTypes(FALLBACK_MVP_SURGERY_TYPES);
        setSelectedSurgeryTypeId(String(FALLBACK_MVP_SURGERY_TYPES[0].id));
      }
    };

    fetchSurgeryTypes();
    setMode('invite');
    setResult(null);
    setErrorMessage(null);
    setSuggestSwitchToInvite(false);
    setCopiedField(null);
  }, [isOpen]);

  const handleCopy = async (text: string, field: 'token' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const resetForm = () => {
    setPatientName('');
    setPatientEmail('');
    setPatientPhone('');
    setDateOfBirth('');
    setSurgeonName('');
    setClinicalNotes('');
  };

  const handleModeChange = (nextMode: ModalMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setSuggestSwitchToInvite(false);
  };

  const handleLinkExistingPatient = async (cleanEmail: string) => {
    const supabase = getSupabase();
    const { data: linkRes, error: linkErr } = await supabase.rpc(
      'nurse_request_patient_link',
      {
        p_patient_email: cleanEmail,
        p_notes: clinicalNotes.trim() || null,
      }
    );

    if (linkErr) {
      setSuggestSwitchToInvite(true);
      throw new Error(
        isMissingRpcError(linkErr)
          ? 'Fitur penautan langsung akun terdaftar (`nurse_request_patient_link`) belum tersedia di Supabase. Anda tetap dapat mengundang pasien baru melalui tab "Undang Pasien Baru".'
          : `Gagal mengajukan penautan pasien: ${linkErr.message}`
      );
    }

    if (!linkRes?.success) {
      const reason = String(linkRes?.reason || 'Gagal mengajukan penautan pasien.');
      if (reason.toLowerCase().includes('tidak ditemukan')) {
        setSuggestSwitchToInvite(true);
      }
      throw new Error(reason);
    }

    setResult({
      mode: 'pending_consent',
      email: cleanEmail,
      patientName: linkRes.patient_name || patientName.trim() || cleanEmail,
    });
    resetForm();
    onPatientAdded();
  };

  const handleInviteNewPatient = async (cleanEmail: string, normalizedPatientName: string) => {
    if (!user) return;
    const supabase = getSupabase();

    const trimmedSurgeryId = selectedSurgeryTypeId.trim();
    const parsedSurgeryTypeId: number | string | null = trimmedSurgeryId
      ? /^\d+$/.test(trimmedSurgeryId)
        ? Number(trimmedSurgeryId)
        : trimmedSurgeryId
      : null;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let token = generateInvitationToken();
    if (!isValidInvitationToken(token)) {
      throw new Error('Gagal menghasilkan token undangan yang valid.');
    }

    let warningMsg: string | undefined;
    let savedSuccessfully = false;
    let lastError: any = null;

    // Retry up to 3 times if generated token hits unique collision (23505)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        token = generateInvitationToken();
      }

      const fullPayload: Record<string, any> = {
        nurse_id: user.id,
        patient_email: cleanEmail,
        patient_name: normalizedPatientName,
        patient_phone: patientPhone.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
        gender,
        surgery_type_id: parsedSurgeryTypeId,
        surgery_date: surgeryDate.trim() || null,
        discharge_date: dischargeDate.trim() || null,
        surgeon_name: surgeonName.trim() || null,
        clinical_notes: clinicalNotes.trim() || null,
        token,
        status: 'pending',
        expires_at: expiresAt,
      };

      let { error: invError } = await supabase.from('patient_invitations').insert(fullPayload);

      // Handle missing optional columns gracefully if older schema
      if (
        invError &&
        (invError.message.includes('column') ||
          invError.code === 'PGRST204' ||
          invError.code === '42703')
      ) {
        const { error: fallbackErr } = await supabase.from('patient_invitations').insert({
          nurse_id: user.id,
          patient_email: cleanEmail,
          patient_name: normalizedPatientName,
          token,
          status: 'pending',
          expires_at: expiresAt,
        });
        invError = fallbackErr;
        if (!fallbackErr) {
          warningMsg =
            'Undangan tersimpan, namun sebagian kolom tambahan belum tersedia di tabel `patient_invitations`.';
        }
      }

      // Handle FK mismatch if surgery_types came from client fallback instead of DB rows
      if (invError && invError.code === '23503' && fullPayload.surgery_type_id !== null) {
        const { error: retryNoSurgeryErr } = await supabase.from('patient_invitations').insert({
          ...fullPayload,
          surgery_type_id: null,
        });
        invError = retryNoSurgeryErr;
        if (!retryNoSurgeryErr) {
          warningMsg =
            'Undangan tersimpan, namun referensi jenis operasi belum cocok dengan daftar di database.';
        }
      }

      if (!invError) {
        savedSuccessfully = true;
        break;
      }

      lastError = invError;
      if (invError.code === '23505' && String(invError.message || '').toLowerCase().includes('token')) {
        continue;
      }
      break;
    }

    if (!savedSuccessfully) {
      throw new Error(`Gagal menyimpan undangan ke database: ${lastError?.message || 'Error tidak diketahui'}`);
    }

    const activationUrl = getPatientActivationUrl(token, cleanEmail);

    setResult({
      mode: 'invited',
      email: cleanEmail,
      patientName: normalizedPatientName,
      token,
      activationUrl,
      warning: warningMsg,
    });
    resetForm();
    onPatientAdded();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isDemoMode) {
      setErrorMessage(
        'Mode Demo tidak menyimpan data pasien baru ke database. Silakan masuk menggunakan akun Perawat asli.'
      );
      return;
    }

    const normalizedName = normalizePersonName(patientName);
    if (normalizedName !== patientName) {
      setPatientName(normalizedName);
    }

    const validationError = validatePatientModalInput({
      mode,
      patientName: normalizedName,
      patientEmail,
      dateOfBirth,
      selectedSurgeryTypeId,
      surgeryDate,
      dischargeDate,
    });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuggestSwitchToInvite(false);
    const cleanEmail = patientEmail.trim().toLowerCase();

    try {
      if (mode === 'link') {
        await handleLinkExistingPatient(cleanEmail);
      } else {
        await handleInviteNewPatient(cleanEmail, normalizedName);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memproses data pasien.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-slate-800 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Tambah / Undang Pasien</h2>
              <p className="text-xs text-slate-500">
                Undang pasien baru untuk aktivasi akun atau hubungkan pasien yang sudah terdaftar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="mt-5 space-y-4">
            <div
              className={`p-4 border rounded-xl text-center space-y-2 ${
                result.mode === 'pending_consent'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              {result.mode === 'pending_consent' ? (
                <Clock className="w-8 h-8 text-blue-600 mx-auto" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              )}
              <h3
                className={`text-sm font-bold ${
                  result.mode === 'pending_consent' ? 'text-blue-900' : 'text-emerald-900'
                }`}
              >
                {result.mode === 'pending_consent'
                  ? 'Permintaan Penautan Dikirim (Menunggu Persetujuan Pasien)'
                  : 'Undangan Pasien Tersimpan di Database!'}
              </h3>
              <p
                className={`text-xs ${
                  result.mode === 'pending_consent' ? 'text-blue-800' : 'text-emerald-800'
                }`}
              >
                {result.mode === 'pending_consent' ? (
                  <>
                    Akun pasien <strong>{result.patientName}</strong> ({result.email}) sudah
                    terdaftar di NurseGo. Notifikasi persetujuan telah dikirim dan akses data klinis
                    aktif setelah pasien menyetujui pada menu Profil.
                  </>
                ) : (
                  <>
                    <strong>{result.patientName}</strong> ({result.email}) kini muncul pada daftar
                    pasien dengan status <strong>Menunggu Aktivasi</strong>.
                  </>
                )}
              </p>
            </div>

            {result.mode === 'invited' && result.token && (
              <>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-slate-600 font-medium">Kode Aktivasi:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-teal-700 text-sm bg-white px-2.5 py-1 rounded border border-slate-200">
                        {result.token}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(result.token!, 'token')}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600"
                        title="Salin kode"
                      >
                        {copiedField === 'token' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {result.activationUrl && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-200">
                      <span className="text-slate-600 font-medium block">Tautan Aktivasi Langsung:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={result.activationUrl}
                          className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(result.activationUrl!, 'link')}
                          className="px-2.5 py-1.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-semibold hover:bg-teal-100 inline-flex items-center gap-1"
                        >
                          {copiedField === 'link' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Salin Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex flex-wrap gap-2">
                    <a
                      href={`mailto:${result.email}?subject=${encodeURIComponent(
                        'Undangan Aktivasi Akun Pasien NurseGo'
                      )}&body=${encodeURIComponent(
                        `Halo ${result.patientName},\n\nSilakan aktifkan akun pemantauan pascaoperasi NurseGo Anda menggunakan tautan berikut:\n${result.activationUrl}\n\nAtau masukkan kode aktivasi: ${result.token}\nGunakan email: ${result.email}`
                      )}`}
                      className="flex-1 py-2 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold rounded-lg inline-flex items-center justify-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5 text-teal-600" />
                      <span>Kirim via Aplikasi Email</span>
                    </a>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    Bagikan <strong>Tautan Aktivasi</strong> atau <strong>Kode Aktivasi</strong> di atas kepada pasien agar pasien dapat mengaktifkan akun dengan email yang sama.
                  </span>
                </div>
              </>
            )}

            {result.warning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
                {result.warning}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl transition-colors"
            >
              Selesai & Tutup
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Explicit Mode Switcher: Undang Pasien Baru vs Hubungkan Pasien Terdaftar */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleModeChange('invite')}
                className={`py-2 px-3 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors ${
                  mode === 'invite'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Undang Pasien Baru</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('link')}
                className={`py-2 px-3 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors ${
                  mode === 'link'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Pasien Sudah Terdaftar</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                  {suggestSwitchToInvite && mode === 'link' && (
                    <button
                      type="button"
                      onClick={() => handleModeChange('invite')}
                      className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 font-semibold rounded-lg text-[11px]"
                    >
                      Beralih ke Undang Pasien Baru
                    </button>
                  )}
                </div>
              )}

              {mode === 'link' ? (
                <>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      Gunakan mode ini jika pasien <strong>sudah memiliki akun NurseGo aktif</strong>. Permintaan penautan akan dikirim dan menunggu persetujuan pasien.
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Alamat Email Akun Pasien Terdaftar *
                    </label>
                    <input
                      type="email"
                      required
                      value={patientEmail}
                      onChange={(e) => setPatientEmail(e.target.value)}
                      placeholder="pasien@gmail.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Catatan Permintaan Penautan (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                      placeholder="Contoh: Perawat pendamping pemulihan di rumah..."
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nama Lengkap Pasien *
                      </label>
                      <input
                        type="text"
                        required
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        onBlur={() => setPatientName((prev) => normalizePersonName(prev))}
                        placeholder="Contoh: Budi Santoso"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nomor HP / WhatsApp
                      </label>
                      <input
                        type="tel"
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white text-sm font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Alamat Email Pasien (Untuk Aktivasi Akun) *
                    </label>
                    <input
                      type="email"
                      required
                      value={patientEmail}
                      onChange={(e) => setPatientEmail(e.target.value)}
                      placeholder="pasien@gmail.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        max={getLocalDateInputValue()}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Jenis Operasi Pascaoperasi (7 Standar MVP) *
                    </label>
                    <select
                      required
                      value={selectedSurgeryTypeId}
                      onChange={(e) => setSelectedSurgeryTypeId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    >
                      {surgeryTypes.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} {st.code ? `(${st.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tanggal Operasi</label>
                      <input
                        type="date"
                        value={surgeryDate}
                        onChange={(e) => setSurgeryDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tanggal Pulang</label>
                      <input
                        type="date"
                        value={dischargeDate}
                        min={surgeryDate || undefined}
                        onChange={(e) => setDischargeDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Dokter Penanggung Jawab / Operator
                    </label>
                    <input
                      type="text"
                      value={surgeonName}
                      onChange={(e) => setSurgeonName(e.target.value)}
                      placeholder="dr. Bambang, Sp.B"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Catatan Khusus Pemulihan Pascaoperasi
                    </label>
                    <textarea
                      rows={2}
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                      placeholder="Pantau rembesan luka dan mobilisasi bertahap..."
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {loading
                    ? 'Memproses...'
                    : mode === 'link'
                    ? 'Kirim Permintaan Penautan'
                    : 'Simpan & Undang Pasien'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
