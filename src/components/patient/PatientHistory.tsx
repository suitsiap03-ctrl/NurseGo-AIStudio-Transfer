/**
 * Patient Monitoring History & Recovery Trend Charts for NurseGo
 *
 * Features:
 * - Chronological monitoring timeline with category filters (Semua, Tanda Vital, Nyeri, Luka, Gejala)
 * - Interactive Recharts recovery trend charts (7/14/30 days)
 * - Real-time synchronization & strict Demo Mode isolation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabaseClient';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { DEMO_PATIENTS } from '../../data/mockData';
import { MetricChartsView } from '../common/Charts';
import {
  HeartPulse,
  Flame,
  ShieldAlert,
  Activity,
  RefreshCw,
  Clock,
  LineChart,
  ClipboardList,
  AlertCircle,
} from 'lucide-react';
import {
  VitalSignRecord,
  PainRecord,
  SymptomRecord,
  WoundRecord,
} from '../../types/database';

export const PatientHistory: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<
    'all' | 'vitals' | 'pain' | 'wound' | 'symptoms'
  >('all');
  const [showChart, setShowChart] = useState<boolean>(true);

  const [vitals, setVitals] = useState<VitalSignRecord[]>([]);
  const [painRecords, setPainRecords] = useState<PainRecord[]>([]);
  const [symptomRecords, setSymptomRecords] = useState<SymptomRecord[]>([]);
  const [woundRecords, setWoundRecords] = useState<WoundRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);

    if (isDemoMode) {
      const demo = DEMO_PATIENTS[0];
      setVitals(demo.historicalVitals);
      setPainRecords(demo.historicalPain);
      setSymptomRecords(demo.latestSymptoms ? [demo.latestSymptoms] : []);
      setWoundRecords(demo.latestWound ? [demo.latestWound] : []);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    try {
      const [vRes, pRes, sRes, wRes] = await Promise.all([
        supabase
          .from('vital_sign_records')
          .select('*')
          .eq('patient_id', user.id)
          .order('recorded_at', { ascending: false }),
        supabase
          .from('pain_records')
          .select('*')
          .eq('patient_id', user.id)
          .order('recorded_at', { ascending: false }),
        supabase
          .from('symptom_records')
          .select('*')
          .eq('patient_id', user.id)
          .order('recorded_at', { ascending: false }),
        supabase
          .from('wound_records')
          .select('*')
          .eq('patient_id', user.id)
          .order('recorded_at', { ascending: false }),
      ]);

      const firstError = vRes.error || pRes.error || sRes.error || wRes.error;
      if (firstError) {
        setErrorMsg(`Gagal memuat sebagian riwayat pemantauan: ${firstError.message}`);
      }

      setVitals((vRes.data as VitalSignRecord[]) || []);
      setPainRecords((pRes.data as PainRecord[]) || []);
      setSymptomRecords((sRes.data as SymptomRecord[]) || []);
      setWoundRecords((wRes.data as WoundRecord[]) || []);
    } catch (err: any) {
      console.error('Error fetching patient history:', err);
      setErrorMsg(err?.message || 'Terjadi kesalahan saat memuat riwayat pemantauan.');
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useRealtimeSubscription(
    `patient-history-${user?.id || 'anon'}`,
    user && !isDemoMode
      ? [
          { table: 'vital_sign_records', filter: `patient_id=eq.${user.id}` },
          { table: 'pain_records', filter: `patient_id=eq.${user.id}` },
          { table: 'symptom_records', filter: `patient_id=eq.${user.id}` },
          { table: 'wound_records', filter: `patient_id=eq.${user.id}` },
        ]
      : [],
    fetchHistory,
    Boolean(user && !isDemoMode)
  );

  const visibleCount =
    filterType === 'all'
      ? vitals.length + painRecords.length + woundRecords.length + symptomRecords.length
      : filterType === 'vitals'
      ? vitals.length
      : filterType === 'pain'
      ? painRecords.length
      : filterType === 'wound'
      ? woundRecords.length
      : symptomRecords.length;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Riwayat Pemantauan & Grafik Pemulihan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Arsip lengkap laporan mandiri dan visualisasi tren tanda vital serta penurunan rasa
            nyeri di rumah.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChart(!showChart)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${
              showChart
                ? 'bg-teal-50 text-teal-800 border-teal-200'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>{showChart ? 'Sembunyikan Grafik' : 'Lihat Grafik'}</span>
          </button>

          <button
            onClick={() => fetchHistory()}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Muat ulang riwayat"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
            onClick={() => fetchHistory()}
            className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Interactive Charts View */}
      {showChart && (
        <MetricChartsView vitals={vitals} painRecords={painRecords} isPatientView={true} />
      )}

      {/* Filter Tabs */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap gap-2 text-xs font-semibold">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filterType === 'all'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Semua Data (
          {vitals.length + painRecords.length + woundRecords.length + symptomRecords.length})
        </button>
        <button
          onClick={() => setFilterType('vitals')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filterType === 'vitals'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Tanda Vital ({vitals.length})
        </button>
        <button
          onClick={() => setFilterType('pain')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filterType === 'pain'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Skala Nyeri ({painRecords.length})
        </button>
        <button
          onClick={() => setFilterType('wound')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filterType === 'wound'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Kondisi Luka ({woundRecords.length})
        </button>
        <button
          onClick={() => setFilterType('symptoms')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filterType === 'symptoms'
              ? 'bg-teal-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Gejala ({symptomRecords.length})
        </button>
      </div>

      {/* Timeline List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white p-12 text-center text-xs text-slate-500 rounded-xl border border-slate-200">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600 mb-2" />
            <span>Memuat riwayat pemantauan...</span>
          </div>
        ) : visibleCount === 0 ? (
          <div className="bg-white p-12 text-center text-xs text-slate-500 rounded-xl border border-slate-200 space-y-2">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">Belum ada data pada kategori ini.</p>
            <p className="text-slate-400">
              Catatan akan muncul secara otomatis setelah Anda mengisi formulir pemantauan harian.
            </p>
          </div>
        ) : (
          <>
            {/* Vitals Feed */}
            {(filterType === 'all' || filterType === 'vitals') && vitals.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-teal-600" />
                  <span>Riwayat Tanda Vital</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {vitals.map((v) => (
                    <div
                      key={v.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {new Date(v.recorded_at).toLocaleDateString('id-ID')}{' '}
                            {new Date(v.recorded_at).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-800 font-medium tabular-nums text-xs">
                          <span>
                            TD:{' '}
                            <strong className="text-slate-900">
                              {v.systolic_bp}/{v.diastolic_bp}
                            </strong>{' '}
                            mmHg
                          </span>
                          <span>
                            Nadi: <strong className="text-slate-900">{v.heart_rate}</strong> bpm
                          </span>
                          <span>
                            Napas: <strong className="text-slate-900">{v.respiratory_rate}</strong>{' '}
                            x/m
                          </span>
                          <span>
                            Suhu: <strong className="text-slate-900">{v.body_temperature}</strong>{' '}
                            °C
                          </span>
                          <span>
                            SpO2: <strong className="text-slate-900">{v.oxygen_saturation}</strong>{' '}
                            %
                          </span>
                        </div>
                      </div>
                      {v.notes && (
                        <span className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded max-w-xs truncate">
                          {v.notes}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pain Records Feed */}
            {(filterType === 'all' || filterType === 'pain') && painRecords.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-teal-600" />
                  <span>Riwayat Skala Nyeri</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {painRecords.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-500">
                          {new Date(p.recorded_at).toLocaleDateString('id-ID')}{' '}
                          {new Date(p.recorded_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-slate-800">
                          <strong>Lokasi:</strong> {p.location} · <strong>Karakteristik:</strong>{' '}
                          {p.characteristics}
                        </div>
                        {(p.aggravating_factors || p.relieving_factors) && (
                          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                            {p.aggravating_factors && <span>Pemberat: {p.aggravating_factors}</span>}
                            {p.relieving_factors && <span>Peringan: {p.relieving_factors}</span>}
                          </div>
                        )}
                        {p.notes && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded">
                            {p.notes}
                          </p>
                        )}
                      </div>
                      <span className="px-3 py-1 rounded-lg font-extrabold text-sm bg-teal-50 text-teal-800 border border-teal-200 self-start sm:self-center tabular-nums">
                        Skala: {p.pain_scale} / 10
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wound Feed */}
            {(filterType === 'all' || filterType === 'wound') && woundRecords.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-teal-600" />
                  <span>Riwayat Kondisi Luka Operasi</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {woundRecords.map((w) => (
                    <div key={w.id} className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {new Date(w.recorded_at).toLocaleDateString('id-ID')}{' '}
                          {new Date(w.recorded_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {w.has_discharge_or_pus || w.has_bleeding || w.has_open_wound ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Ada Tanda Bahaya Luka
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                            Luka Bersih
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 text-[11px]">
                        <span>Kemerahan: {w.has_redness ? 'Ya' : 'Tidak'}</span>
                        <span>Bengkak: {w.has_swelling ? 'Ya' : 'Tidak'}</span>
                        <span>Hangat: {w.has_warmth ? 'Ya' : 'Tidak'}</span>
                        <span>Nanah/Pus: {w.has_discharge_or_pus ? 'Positif' : 'Tidak'}</span>
                        <span>Perdarahan: {w.has_bleeding ? 'Ada' : 'Tidak'}</span>
                        <span>Luka Terbuka: {w.has_open_wound ? 'Terbuka' : 'Tertutup'}</span>
                      </div>
                      {w.notes && (
                        <p className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded">
                          Catatan: {w.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Symptoms & General Condition Feed */}
            {(filterType === 'all' || filterType === 'symptoms') && symptomRecords.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" />
                  <span>Riwayat Gejala & Kondisi Umum</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {symptomRecords.map((s) => (
                    <div key={s.id} className="p-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span>
                          {new Date(s.recorded_at).toLocaleDateString('id-ID')}{' '}
                          {new Date(s.recorded_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold capitalize">
                            Kondisi: {s.general_condition.replace(/_/g, ' ')}
                          </span>
                          {s.symptom_trend && (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium capitalize">
                              Tren: {s.symptom_trend}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-700">
                        {Array.isArray(s.symptoms) && s.symptoms.length > 0 ? (
                          s.symptoms.map((sym, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-medium"
                            >
                              {sym}
                            </span>
                          ))
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            Tidak ada keluhan gejala spesifik
                          </span>
                        )}
                      </div>
                      {s.notes && (
                        <p className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded">
                          {s.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
