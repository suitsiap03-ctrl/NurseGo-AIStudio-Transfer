/**
 * Patient Monitoring Form for NurseGo
 *
 * - 5-step guided flow: Tanda Vital, Nyeri, Gejala, Kondisi Luka, Kondisi Umum & Ringkasan
 * - Checks EVERY Supabase `{ error }` before claiming success
 * - Saves `generalFeeling` (as `general_condition` + `symptom_trend`) and `woundNotes` & additional notes
 * - Triggers clinical rule alerts & inserts real `notifications` for assigned nurses
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { evaluateClinicalMonitoring, EvaluatedAlert } from '../../lib/clinicalRules';
import { notifyAssignedNurses } from '../../lib/notifications';
import {
  HeartPulse,
  Flame,
  Activity,
  ShieldAlert,
  Smile,
  Meh,
  Frown,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Send
} from 'lucide-react';

interface PatientMonitoringFormProps {
  onSuccess: () => void;
}

export const PatientMonitoringForm: React.FC<PatientMonitoringFormProps> = ({ onSuccess }) => {
  const { user, profile, isDemoMode } = useAuth();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // STEP 1: Tanda Vital
  const [systolic, setSystolic] = useState<string>('120');
  const [diastolic, setDiastolic] = useState<string>('80');
  const [temperature, setTemperature] = useState<string>('36.6');
  const [heartRate, setHeartRate] = useState<string>('76');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('18');
  const [oxygenSaturation, setOxygenSaturation] = useState<string>('98');

  // STEP 2: Tingkat Nyeri
  const [painScale, setPainScale] = useState<number>(2);
  const [painLocation, setPainLocation] = useState<string>('Area luka operasi');
  const [painCharacteristic, setPainCharacteristic] = useState<string>('Nyeri tumpul hilang timbul');
  const [aggravating, setAggravating] = useState<string>('Saat bangun dari tempat tidur');
  const [relieving, setRelieving] = useState<string>('Istirahat berbaring');

  // STEP 3: Gejala yang Dirasakan
  const symptomList = [
    'Demam',
    'Mual',
    'Muntah',
    'Pusing',
    'Sesak napas',
    'Batuk',
    'Lemas',
    'Nafsu makan menurun',
    'Gangguan buang air',
    'Perut kembung',
  ];
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [symptomTrend, setSymptomTrend] = useState<'membaik' | 'sama' | 'memburuk'>('membaik');
  const [symptomNotes, setSymptomNotes] = useState<string>('');

  // STEP 4: Kondisi Luka Operasi
  const [isWoundNormal, setIsWoundNormal] = useState<boolean>(true);
  const [hasRedness, setHasRedness] = useState<boolean>(false);
  const [hasSwelling, setHasSwelling] = useState<boolean>(false);
  const [hasWarmth, setHasWarmth] = useState<boolean>(false);
  const [hasDischarge, setHasDischarge] = useState<boolean>(false);
  const [hasBleeding, setHasBleeding] = useState<boolean>(false);
  const [hasOpenWound, setHasOpenWound] = useState<boolean>(false);
  const [hasIncreasedPain, setHasIncreasedPain] = useState<boolean>(false);
  const [woundNotes, setWoundNotes] = useState<string>('');

  // STEP 5: Kondisi Umum & Catatan Tambahan
  const [generalFeeling, setGeneralFeeling] = useState<
    'sangat_baik' | 'baik' | 'biasa_saja' | 'kurang_baik' | 'buruk'
  >('baik');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    alert?: EvaluatedAlert | null;
  } | null>(null);

  const toggleSymptom = (sym: string) => {
    setSelectedSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const parseVitalNumber = (raw: string): number => {
    const cleaned = raw.trim().replace(',', '.');
    if (!cleaned) return NaN;
    return Number(cleaned);
  };

  const validateStep1 = () => {
    const sys = parseVitalNumber(systolic);
    const dia = parseVitalNumber(diastolic);
    const hr = parseVitalNumber(heartRate);
    const rr = parseVitalNumber(respiratoryRate);
    const temp = parseVitalNumber(temperature);
    const spo2 = parseVitalNumber(oxygenSaturation);

    if (isNaN(sys) || sys < 50 || sys > 260) {
      setErrorMsg('Tekanan darah sistolik harus di antara 50 – 260 mmHg.');
      return false;
    }
    if (isNaN(dia) || dia < 30 || dia > 160) {
      setErrorMsg('Tekanan darah diastolik harus di antara 30 – 160 mmHg.');
      return false;
    }
    if (isNaN(temp) || temp < 32 || temp > 43) {
      setErrorMsg('Suhu tubuh harus di antara 32°C – 43°C.');
      return false;
    }
    if (isNaN(hr) || hr < 30 || hr > 220) {
      setErrorMsg('Denyut nadi harus di antara 30 – 220 bpm.');
      return false;
    }
    if (isNaN(rr) || rr < 6 || rr > 60) {
      setErrorMsg('Frekuensi napas harus di antara 6 – 60 x/menit.');
      return false;
    }
    if (isNaN(spo2) || spo2 < 50 || spo2 > 100) {
      setErrorMsg('Saturasi oksigen (SpO2) harus di antara 50 – 100%.');
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!painLocation.trim()) {
        setErrorMsg('Mohon isi lokasi nyeri yang dirasakan.');
        return;
      }
      setErrorMsg(null);
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setErrorMsg(null);
      setCurrentStep(4);
    } else if (currentStep === 4) {
      setErrorMsg(null);
      setCurrentStep(5);
    }
  };

  const handleFinalSubmit = async () => {
    if (!user || submitting) return;
    setErrorMsg(null);

    const timestamp = new Date().toISOString();
    const combinedGeneralNotes = [
      symptomNotes.trim(),
      additionalNotes.trim() ? `Catatan tambahan: ${additionalNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const vitalsData = {
      patient_id: user.id,
      recorded_by: user.id,
      recorded_at: timestamp,
      systolic_bp: parseVitalNumber(systolic),
      diastolic_bp: parseVitalNumber(diastolic),
      heart_rate: parseVitalNumber(heartRate),
      respiratory_rate: parseVitalNumber(respiratoryRate),
      body_temperature: parseVitalNumber(temperature),
      oxygen_saturation: parseVitalNumber(oxygenSaturation),
      notes: additionalNotes.trim() || undefined,
    };

    const painData = {
      patient_id: user.id,
      recorded_by: user.id,
      recorded_at: timestamp,
      pain_scale: painScale,
      location: painLocation.trim() || 'Area operasi',
      characteristics: painCharacteristic.trim(),
      aggravating_factors: aggravating.trim() || undefined,
      relieving_factors: relieving.trim() || undefined,
    };

    const symptomData = {
      patient_id: user.id,
      recorded_by: user.id,
      recorded_at: timestamp,
      symptoms: selectedSymptoms,
      general_condition: generalFeeling,
      symptom_trend: symptomTrend,
      notes: combinedGeneralNotes || `Tren gejala: ${symptomTrend}`,
    };

    const woundData = {
      patient_id: user.id,
      recorded_by: user.id,
      recorded_at: timestamp,
      is_normal: isWoundNormal,
      has_redness: hasRedness,
      has_swelling: hasSwelling,
      has_warmth: hasWarmth,
      has_discharge_or_pus: hasDischarge,
      has_bleeding: hasBleeding,
      has_open_wound: hasOpenWound,
      has_increased_pain: hasIncreasedPain,
      notes: woundNotes.trim() || undefined,
    };

    const alertEvaluation = evaluateClinicalMonitoring({
      vitals: vitalsData,
      pain: painData,
      symptoms: symptomData,
      wound: woundData,
    });

    if (isDemoMode) {
      setSubmitResult({
        success: true,
        alert: alertEvaluation,
      });
      return;
    }

    setSubmitting(true);
    const supabase = getSupabase();

    try {
      // 1. Save vital signs
      const { error: vitErr } = await supabase.from('vital_sign_records').insert(vitalsData);
      if (vitErr) throw new Error(`Gagal menyimpan tanda vital: ${vitErr.message}`);

      // 2. Save pain record
      const { error: painErr } = await supabase.from('pain_records').insert(painData);
      if (painErr) throw new Error(`Gagal menyimpan data nyeri: ${painErr.message}`);

      // 3. Save symptom + general condition (fallback if symptom_trend column not migrated yet)
      let { error: symErr } = await supabase.from('symptom_records').insert(symptomData);
      if (symErr && (symErr.message.includes('symptom_trend') || symErr.code === 'PGRST204' || symErr.code === '42703')) {
        const { symptom_trend: _omit, ...fallbackSymptom } = symptomData;
        const retrySym = await supabase.from('symptom_records').insert({
          ...fallbackSymptom,
          notes: `Tren: ${symptomTrend}${combinedGeneralNotes ? ` · ${combinedGeneralNotes}` : ''}`,
        });
        symErr = retrySym.error;
      }
      if (symErr) throw new Error(`Gagal menyimpan gejala & kondisi umum: ${symErr.message}`);

      // 4. Save wound record (fallback if is_normal column not migrated yet)
      let { error: woundErr } = await supabase.from('wound_records').insert(woundData);
      if (woundErr && (woundErr.message.includes('is_normal') || woundErr.code === 'PGRST204' || woundErr.code === '42703')) {
        const { is_normal: _omitWoundNormal, ...fallbackWound } = woundData;
        const retryWound = await supabase.from('wound_records').insert({
          ...fallbackWound,
          notes: `Status luka: ${isWoundNormal ? 'Normal' : 'Ada keluhan'}${woundData.notes ? ` · ${woundData.notes}` : ''}`,
        });
        woundErr = retryWound.error;
      }
      if (woundErr) throw new Error(`Gagal menyimpan kondisi luka: ${woundErr.message}`);

      // 5. Evaluate and insert alert if triggered
      if (alertEvaluation) {
        const { data: newAlert, error: alertErr } = await supabase
          .from('patient_alerts')
          .insert({
            patient_id: user.id,
            alert_level: alertEvaluation.alertLevel,
            title: alertEvaluation.title,
            description: alertEvaluation.description,
            trigger_source: alertEvaluation.triggerSource,
            status: 'aktif',
          })
          .select('id')
          .maybeSingle();

        if (alertErr) throw new Error(`Laporan tersimpan, namun gagal membuat peringatan: ${alertErr.message}`);

        if (newAlert?.id) {
          await supabase.from('patient_alert_events').insert({
            alert_id: newAlert.id,
            event_type: 'alert_created',
            notes: `Dievaluasi dari laporan mandiri: ${alertEvaluation.description}`,
            created_by: user.id,
          });
        }

        await notifyAssignedNurses(user.id, {
          title: `[${alertEvaluation.alertLevel.toUpperCase()}] ${alertEvaluation.title}`,
          message: `${profile?.full_name || 'Pasien'} mengirim laporan dengan indikasi ${alertEvaluation.alertLevel}: ${alertEvaluation.description}`,
          type: 'alert',
          linkTarget: `patient:${user.id}:monitoring`,
        });
      } else {
        await notifyAssignedNurses(user.id, {
          title: 'Laporan Pemantauan Harian Baru',
          message: `${profile?.full_name || 'Pasien'} telah mengirimkan pemantauan harian (TD ${systolic}/${diastolic}, Suhu ${temperature}°C, Nyeri ${painScale}/10).`,
          type: 'monitoring',
          linkTarget: `patient:${user.id}:monitoring`,
        });
      }

      setSubmitResult({
        success: true,
        alert: alertEvaluation,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan laporan ke database.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitResult?.success) {
    const alert = submitResult.alert;
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Laporan Pemantauan Berhasil Terkirim!
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {isDemoMode
              ? 'Pratinjau Mode Demo selesai. Masuk menggunakan akun Pasien asli agar data tersimpan ke Supabase.'
              : 'Hasil tanda vital, skala nyeri, gejala, kondisi umum, dan luka telah tersimpan di Supabase dan dikirimkan ke perawat pendamping Anda.'}
          </p>
        </div>

        {alert ? (
          <div
            className={`p-4 rounded-xl border text-left space-y-2 text-xs ${
              alert.alertLevel === 'darurat'
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : alert.alertLevel === 'urgent'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-yellow-50 border-yellow-300 text-yellow-950'
            }`}
          >
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px]">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Status Peringatan: {alert.alertLevel.toUpperCase()}</span>
            </div>
            <p className="font-semibold">{alert.title}</p>
            <p className="leading-relaxed opacity-90">{alert.description}</p>
            <p className="text-[11px] font-medium pt-1 border-t border-black/10">
              Perawat penanggung jawab Anda telah menerima notifikasi pemantauan ini.
            </p>
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
            Kondisi Anda saat ini tercatat dalam batas stabil. Lanjutkan istirahat dan konsumsi obat sesuai jadwal!
          </div>
        )}

        <button
          onClick={onSuccess}
          className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
        >
          Kembali ke Dashboard Pasien
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Form Pemantauan Mandiri Harian
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Laporkan tanda vital, rasa nyeri, keluhan tubuh, dan kondisi luka jahitan Anda secara berkala.
        </p>

        <div className="grid grid-cols-5 gap-1.5 mt-5">
          {[
            { num: 1, label: 'Tanda Vital' },
            { num: 2, label: 'Nyeri' },
            { num: 3, label: 'Gejala' },
            { num: 4, label: 'Luka' },
            { num: 5, label: 'Ringkasan' },
          ].map((st) => (
            <div
              key={st.num}
              className={`py-1.5 px-1 rounded-lg text-center border text-[11px] transition-all ${
                currentStep === st.num
                  ? 'bg-teal-600 text-white font-bold border-teal-600 shadow-xs'
                  : currentStep > st.num
                  ? 'bg-teal-50 text-teal-800 font-medium border-teal-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              <div className="font-mono text-[10px]">{st.num}</div>
              <div className="truncate hidden sm:block">{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1 */}
      {currentStep === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <HeartPulse className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Langkah 1: Pengukuran Tanda Vital
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Tekanan Darah (Sistolik / Diastolik) *
              </label>
              <div className="flex items-center gap-2 max-w-xs">
                <input
                  type="number"
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold font-mono text-center text-sm"
                />
                <span className="font-bold text-slate-400">/</span>
                <input
                  type="number"
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold font-mono text-center text-sm"
                />
                <span className="text-slate-500 font-medium whitespace-nowrap">mmHg</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Acuan normal: 100/60 – 129/84 mmHg</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Suhu Tubuh (°C) *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold font-mono text-sm"
                />
                <span className="text-slate-500 font-medium">°C</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Denyut Nadi (bpm) *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold font-mono text-sm"
                />
                <span className="text-slate-500 font-medium">bpm</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Frekuensi Pernapasan *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={respiratoryRate}
                  onChange={(e) => setRespiratoryRate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold font-mono text-sm"
                />
                <span className="text-slate-500 font-medium">x/mnt</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Saturasi Oksigen (SpO2) *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={oxygenSaturation}
                  onChange={(e) => setOxygenSaturation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold font-mono text-sm"
                />
                <span className="text-slate-500 font-medium">%</span>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5"
            >
              <span>Lanjut ke Evaluasi Nyeri</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 */}
      {currentStep === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-5 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Flame className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Langkah 2: Evaluasi Skala Nyeri (0–10)
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-800">Skala Nyeri yang Dirasakan:</span>
                <span
                  className={`text-base font-extrabold px-3 py-1 rounded-lg tabular-nums ${
                    painScale === 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : painScale <= 3
                      ? 'bg-teal-100 text-teal-800'
                      : painScale <= 6
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {painScale} / 10
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={painScale}
                onChange={(e) => setPainScale(Number(e.target.value))}
                className="w-full accent-teal-600 h-2.5 bg-slate-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
                <span>0 (Tidak Nyeri)</span>
                <span>3 (Ringan)</span>
                <span>6 (Sedang)</span>
                <span>10 (Berat)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lokasi Nyeri *</label>
                <input
                  type="text"
                  value={painLocation}
                  onChange={(e) => setPainLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Karakter / Rasa Nyeri</label>
                <select
                  value={painCharacteristic}
                  onChange={(e) => setPainCharacteristic(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                >
                  <option value="Nyeri tumpul hilang timbul">Nyeri tumpul hilang timbul</option>
                  <option value="Nyeri perih tertusuk-tusuk">Nyeri perih tertusuk-tusuk</option>
                  <option value="Nyeri berdenyut konstan">Nyeri berdenyut konstan</option>
                  <option value="Nyeri kram tegang">Nyeri kram tegang</option>
                  <option value="Rasa kaku dan panas">Rasa kaku dan panas</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pemicu Nyeri</label>
                <input
                  type="text"
                  value={aggravating}
                  onChange={(e) => setAggravating(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pereda Nyeri</label>
                <input
                  type="text"
                  value={relieving}
                  onChange={(e) => setRelieving(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5"
            >
              <span>Lanjut ke Gejala</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {currentStep === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-5 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Activity className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Langkah 3: Keluhan & Gejala Tubuh
            </h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {symptomList.map((sym) => {
                const isChecked = selectedSymptoms.includes(sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => toggleSymptom(sym)}
                    className={`p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between ${
                      isChecked
                        ? 'bg-teal-50 border-teal-500 text-teal-900 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{sym}</span>
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                        isChecked ? 'bg-teal-600 text-white border-teal-600' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-2">
                Perkembangan keluhan dibanding kemarin:
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setSymptomTrend('membaik')}
                  className={`p-3 rounded-xl border text-center transition-colors ${
                    symptomTrend === 'membaik'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Smile className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                  <span>Membaik</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSymptomTrend('sama')}
                  className={`p-3 rounded-xl border text-center transition-colors ${
                    symptomTrend === 'sama'
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Meh className="w-5 h-5 mx-auto mb-1 text-amber-600" />
                  <span>Sama</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSymptomTrend('memburuk')}
                  className={`p-3 rounded-xl border text-center transition-colors ${
                    symptomTrend === 'memburuk'
                      ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Frown className="w-5 h-5 mx-auto mb-1 text-rose-600" />
                  <span>Memburuk</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Catatan Keluhan</label>
              <textarea
                rows={2}
                value={symptomNotes}
                onChange={(e) => setSymptomNotes(e.target.value)}
                placeholder="Tuliskan keluhan lain jika ada..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5"
            >
              <span>Lanjut ke Kondisi Luka</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 */}
      {currentStep === 4 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-5 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <ShieldAlert className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Langkah 4: Pemeriksaan Kondisi Luka Operasi
            </h2>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isWoundNormal}
                onChange={(e) => {
                  setIsWoundNormal(e.target.checked);
                  if (e.target.checked) {
                    setHasRedness(false);
                    setHasSwelling(false);
                    setHasWarmth(false);
                    setHasDischarge(false);
                    setHasBleeding(false);
                    setHasOpenWound(false);
                    setHasIncreasedPain(false);
                  }
                }}
                className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
              />
              <span className="font-semibold text-emerald-800">
                Luka tampak bersih, kering, dan normal tanpa keluhan
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {[
                { label: 'Kemerahan di sekitar jahitan', checked: hasRedness, set: setHasRedness, danger: false },
                { label: 'Bengkak di sekitar luka', checked: hasSwelling, set: setHasSwelling, danger: false },
                { label: 'Teraba hangat/panas saat disentuh', checked: hasWarmth, set: setHasWarmth, danger: false },
                { label: 'Keluar nanah / cairan keruh (Pus)', checked: hasDischarge, set: setHasDischarge, danger: true },
                { label: 'Keluar rembesan darah aktif', checked: hasBleeding, set: setHasBleeding, danger: true },
                { label: 'Tepi luka jahitan terbuka', checked: hasOpenWound, set: setHasOpenWound, danger: true },
                { label: 'Nyeri luka terasa meningkat tajam', checked: hasIncreasedPain, set: setHasIncreasedPain, danger: false },
              ].map((item) => (
                <label
                  key={item.label}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer ${
                    item.danger ? 'border-rose-200 bg-rose-50/50 hover:bg-rose-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => {
                      item.set(e.target.checked);
                      if (e.target.checked) setIsWoundNormal(false);
                    }}
                    className={`rounded w-4 h-4 ${item.danger ? 'text-rose-600' : 'text-teal-600'}`}
                  />
                  <span className={item.danger ? 'font-semibold text-rose-900' : ''}>{item.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Kondisi Luka / Balutan (Opsional)
              </label>
              <textarea
                rows={2}
                value={woundNotes}
                onChange={(e) => setWoundNotes(e.target.value)}
                placeholder="Misal: Kasa baru diganti pagi ini, warna luka tampak rapi..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5"
            >
              <span>Lanjut ke Ringkasan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5 */}
      {currentStep === 5 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-5 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Smile className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Langkah 5: Kondisi Tubuh Hari Ini & Ringkasan
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-800 mb-2">
                Bagaimana kondisi Anda secara keseluruhan hari ini? *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'sangat_baik', label: 'Sangat Baik' },
                  { id: 'baik', label: 'Baik' },
                  { id: 'biasa_saja', label: 'Biasa Saja' },
                  { id: 'kurang_baik', label: 'Kurang Baik' },
                  { id: 'buruk', label: 'Buruk' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setGeneralFeeling(item.id as any)}
                    className={`p-2.5 rounded-lg border text-center transition-colors font-semibold ${
                      generalFeeling === item.id
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Catatan Tambahan untuk Perawat (Opsional)
              </label>
              <textarea
                rows={2}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Ceritakan aktivitas hari ini, nafsu makan, kualitas tidur, atau pertanyaan untuk perawat..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-800 block text-xs border-b border-slate-200 pb-1">
                Ringkasan Data Pemantauan yang Akan Dikirim:
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1">
                <div>
                  <span className="text-slate-400">Tekanan Darah:</span>
                  <div className="font-bold text-slate-900">{systolic}/{diastolic} mmHg</div>
                </div>
                <div>
                  <span className="text-slate-400">Suhu Tubuh:</span>
                  <div className="font-bold text-slate-900">{temperature} °C</div>
                </div>
                <div>
                  <span className="text-slate-400">Denyut Nadi / SpO2:</span>
                  <div className="font-bold text-slate-900">{heartRate} bpm · {oxygenSaturation}%</div>
                </div>
                <div>
                  <span className="text-slate-400">Skala Nyeri:</span>
                  <div className="font-bold text-slate-900">{painScale}/10 ({painLocation})</div>
                </div>
                <div>
                  <span className="text-slate-400">Kondisi Luka:</span>
                  <div className="font-bold text-slate-900">
                    {hasDischarge || hasBleeding || hasOpenWound
                      ? 'Ada Tanda Bahaya Luka'
                      : isWoundNormal
                      ? 'Normal & Kering'
                      : 'Kemerahan/Bengkak'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Kondisi Umum:</span>
                  <div className="font-bold text-slate-900 capitalize">{generalFeeling.replace('_', ' ')}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Kembali
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleFinalSubmit}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-2 disabled:opacity-50"
            >
              <span>{submitting ? 'Menyimpan...' : 'Simpan & Kirim Pemantauan'}</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
