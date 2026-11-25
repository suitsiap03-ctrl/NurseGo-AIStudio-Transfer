/**
 * Interactive Nurse Dashboard Analytics Charts powered by Recharts
 *
 * Strictly driven by live Supabase monitoring & alert records across the nurse's
 * connected patients (no static SVG charts, no hardcoded numbers, no dummy data in Live Mode).
 * Distinguishes loading, error, and genuinely empty states cleanly.
 */

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  HeartPulse,
  Thermometer,
  Activity,
  Droplets,
  Flame,
} from 'lucide-react';
import { PainRecord, PatientAlert, VitalSignRecord } from '../../types/database';
import { getLocalDateInputValue } from '../../lib/dateUtils';

export interface DashboardPatientOption {
  patientId: string;
  fullName: string;
}

interface NurseDashboardChartsProps {
  patients: DashboardPatientOption[];
  vitals: VitalSignRecord[];
  painRecords: PainRecord[];
  alerts: PatientAlert[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

type ChartMode = 'activity' | 'vitals';
type VitalMetric = 'bp' | 'temp' | 'pulse' | 'spo2' | 'pain';
type RangeDays = 7 | 14 | 30;

export interface DailyActivityPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  monitoringCount: number;
  alertCount: number;
}

export function buildDailyActivitySeries(
  vitals: VitalSignRecord[],
  painRecords: PainRecord[],
  alerts: PatientAlert[],
  days: RangeDays
): DailyActivityPoint[] {
  const now = new Date();
  const buckets = new Map<
    string,
    { label: string; fullDate: string; monitoringKeys: Set<string>; alertCount: number }
  >();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = getLocalDateInputValue(d);
    buckets.set(key, {
      label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      fullDate: d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      monitoringKeys: new Set<string>(),
      alertCount: 0,
    });
  }

  // Group monitoring events by patient + minute-level timestamp so 1 multi-step submission counts as 1 report
  const addMonitoring = (patientId: string, iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const key = getLocalDateInputValue(d);
    const bucket = buckets.get(key);
    if (!bucket) return;
    const sessionKey = `${patientId}:${iso.slice(0, 16)}`;
    bucket.monitoringKeys.add(sessionKey);
  };

  vitals.forEach((v) => addMonitoring(v.patient_id, v.recorded_at));
  painRecords.forEach((p) => addMonitoring(p.patient_id, p.recorded_at));

  alerts.forEach((a) => {
    const d = new Date(a.created_at);
    if (Number.isNaN(d.getTime())) return;
    const key = getLocalDateInputValue(d);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.alertCount += 1;
    }
  });

  return Array.from(buckets.entries()).map(([dateKey, b]) => ({
    dateKey,
    label: b.label,
    fullDate: b.fullDate,
    monitoringCount: b.monitoringKeys.size,
    alertCount: b.alertCount,
  }));
}

export const NurseDashboardCharts: React.FC<NurseDashboardChartsProps> = ({
  patients,
  vitals,
  painRecords,
  alerts,
  loading,
  error,
  onRetry,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('activity');
  const [vitalMetric, setVitalMetric] = useState<VitalMetric>('bp');
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('all');

  const patientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    patients.forEach((p) => map.set(p.patientId, p.fullName));
    return map;
  }, [patients]);

  const effectivePatientId =
    selectedPatientId === 'all' || patientNameMap.has(selectedPatientId)
      ? selectedPatientId
      : 'all';

  const scopedVitals = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 86400000;
    return vitals
      .filter((v) => {
        const t = new Date(v.recorded_at).getTime();
        if (Number.isNaN(t) || t < cutoff) return false;
        return effectivePatientId === 'all' || v.patient_id === effectivePatientId;
      })
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  }, [vitals, rangeDays, effectivePatientId]);

  const scopedPain = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 86400000;
    return painRecords
      .filter((p) => {
        const t = new Date(p.recorded_at).getTime();
        if (Number.isNaN(t) || t < cutoff) return false;
        return effectivePatientId === 'all' || p.patient_id === effectivePatientId;
      })
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  }, [painRecords, rangeDays, effectivePatientId]);

  const scopedAlerts = useMemo(() => {
    return alerts.filter(
      (a) => effectivePatientId === 'all' || a.patient_id === effectivePatientId
    );
  }, [alerts, effectivePatientId]);

  const dailyActivitySeries = useMemo(
    () => buildDailyActivitySeries(scopedVitals, scopedPain, scopedAlerts, rangeDays),
    [scopedVitals, scopedPain, scopedAlerts, rangeDays]
  );

  const hasAnyActivityInRange = dailyActivitySeries.some(
    (d) => d.monitoringCount > 0 || d.alertCount > 0
  );

  const painChartSeries = useMemo(() => {
    return scopedPain.map((p) => {
      const d = new Date(p.recorded_at);
      const patientName = patientNameMap.get(p.patient_id) || 'Pasien';
      return {
        label: `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        fullDate: `${patientName} · ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        pain: Number(p.pain_scale),
      };
    });
  }, [scopedPain, patientNameMap]);

  const vitalSignChartSeries = useMemo(() => {
    return scopedVitals.map((v) => {
      const d = new Date(v.recorded_at);
      const patientName = patientNameMap.get(v.patient_id) || 'Pasien';
      return {
        label: `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        fullDate: `${patientName} · ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
        systolic: Number(v.systolic_bp),
        diastolic: Number(v.diastolic_bp),
        temp: Number(v.body_temperature),
        pulse: Number(v.heart_rate),
        spo2: Number(v.oxygen_saturation),
      };
    });
  }, [scopedVitals, patientNameMap]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="h-[280px] sm:h-[310px] w-full flex flex-col items-center justify-center bg-slate-50/70 rounded-xl border border-slate-200 text-xs text-slate-500 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-teal-600" />
          <span>Memuat data grafik pemantauan aktual dari Supabase...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-[260px] w-full flex flex-col items-center justify-center bg-rose-50/70 rounded-xl border border-rose-200 p-6 text-center text-xs text-rose-800 gap-3">
          <AlertCircle className="w-7 h-7 text-rose-600" />
          <div className="space-y-1 max-w-md">
            <p className="font-semibold">Data grafik tidak dapat dimuat</p>
            <p className="text-rose-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Muat Ulang</span>
          </button>
        </div>
      );
    }

    if (patients.length === 0) {
      return (
        <div className="h-[240px] w-full flex flex-col items-center justify-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 gap-1.5">
          <BarChart3 className="w-8 h-8 text-slate-300 mb-1" />
          <p className="font-semibold text-slate-700">Belum ada pasien terhubung</p>
          <p className="text-slate-400 max-w-sm">
            Grafik tren pemantauan dan peringatan klinis akan tampil secara otomatis setelah pasien terhubung dan mengirim laporan.
          </p>
        </div>
      );
    }

    if (chartMode === 'activity') {
      if (!hasAnyActivityInRange) {
        return (
          <div className="h-[240px] w-full flex flex-col items-center justify-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 gap-1.5">
            <BarChart3 className="w-8 h-8 text-slate-300 mb-1" />
            <p className="font-semibold text-slate-700">
              Belum ada aktivitas pemantauan atau peringatan dalam {rangeDays} hari terakhir
            </p>
            <p className="text-slate-400 max-w-sm">
              Coba perluas rentang hari atau tunggu laporan pemantauan terbaru dari pasien.
            </p>
          </div>
        );
      }

      return (
        <div className="h-[280px] sm:h-[320px] w-full min-w-0 bg-slate-50/50 rounded-xl p-2 sm:p-4 border border-slate-200">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250}>
            <BarChart
              data={dailyActivitySeries}
              margin={{ top: 14, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                minTickGap={14}
                tickMargin={6}
              />
              <YAxis
                width={36}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
              <Bar
                dataKey="monitoringCount"
                name="Laporan Monitoring"
                fill="#0d9488"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="alertCount"
                name="Peringatan Klinis"
                fill="#e11d48"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Vital & Pain Trend Mode
    const activeSeriesLength =
      vitalMetric === 'pain' ? painChartSeries.length : vitalSignChartSeries.length;

    if (activeSeriesLength === 0) {
      return (
        <div className="h-[240px] w-full flex flex-col items-center justify-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 gap-1.5">
          <TrendingUp className="w-8 h-8 text-slate-300 mb-1" />
          <p className="font-semibold text-slate-700">
            Belum ada data {vitalMetric === 'pain' ? 'skala nyeri' : 'tanda vital'} dalam {rangeDays} hari terakhir
          </p>
          <p className="text-slate-400 max-w-sm">
            Data pasien akan otomatis muncul di grafik segera setelah laporan dikirimkan.
          </p>
        </div>
      );
    }

    if (vitalMetric === 'bp') {
      const bpVals = vitalSignChartSeries.flatMap((d) => [d.systolic, d.diastolic]).filter(Number.isFinite);
      const minBp = Math.max(40, Math.floor((Math.min(...bpVals) - 10) / 10) * 10);
      const maxBp = Math.min(220, Math.ceil((Math.max(...bpVals, 145) + 10) / 10) * 10);

      return (
        <div className="h-[280px] sm:h-[320px] w-full min-w-0 bg-slate-50/50 rounded-xl p-2 sm:p-4 border border-slate-200">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250}>
            <LineChart data={vitalSignChartSeries} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                minTickGap={18}
                tickMargin={6}
              />
              <YAxis width={40} domain={[minBp, maxBp]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                formatter={(value: any, name: any) => [`${value} mmHg`, String(name ?? '')]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
              <ReferenceLine y={140} stroke="#f43f5e" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="systolic"
                name="Sistolik (mmHg)"
                stroke="#0d9488"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0d9488', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="diastolic"
                name="Diastolik (mmHg)"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 3.5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    const metricMeta: Record<
      Exclude<VitalMetric, 'bp'>,
      {
        dataKey: string;
        label: string;
        unit: string;
        color: string;
        pad: number;
        minFloor: number;
        maxCeil: number;
        refHigh?: number;
        refLow?: number;
      }
    > = {
      temp: {
        dataKey: 'temp',
        label: 'Suhu Tubuh',
        unit: '°C',
        color: '#f97316',
        pad: 0.5,
        minFloor: 34,
        maxCeil: 41,
        refHigh: 37.8,
      },
      pulse: {
        dataKey: 'pulse',
        label: 'Denyut Nadi',
        unit: 'bpm',
        color: '#e11d48',
        pad: 8,
        minFloor: 40,
        maxCeil: 180,
        refHigh: 100,
      },
      spo2: {
        dataKey: 'spo2',
        label: 'Saturasi Oksigen (SpO2)',
        unit: '%',
        color: '#10b981',
        pad: 2,
        minFloor: 80,
        maxCeil: 100,
        refLow: 94,
      },
      pain: {
        dataKey: 'pain',
        label: 'Skala Nyeri',
        unit: '/ 10',
        color: '#8b5cf6',
        pad: 1,
        minFloor: 0,
        maxCeil: 10,
        refHigh: 6,
      },
    };

    const cfg = metricMeta[vitalMetric];
    const singleSeriesData: Array<Record<string, string | number>> =
      vitalMetric === 'pain' ? painChartSeries : vitalSignChartSeries;
    const nums = singleSeriesData
      .map((d) => Number(d[cfg.dataKey]))
      .filter((n) => Number.isFinite(n));
    const minVal =
      vitalMetric === 'pain'
        ? 0
        : Math.max(cfg.minFloor, Number((Math.min(...nums, cfg.refLow ?? Infinity) - cfg.pad).toFixed(1)));
    const maxVal =
      vitalMetric === 'pain'
        ? 10
        : Math.min(cfg.maxCeil, Number((Math.max(...nums, cfg.refHigh ?? -Infinity) + cfg.pad).toFixed(1)));

    return (
      <div className="h-[280px] sm:h-[320px] w-full min-w-0 bg-slate-50/50 rounded-xl p-2 sm:p-4 border border-slate-200">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250}>
          <LineChart data={singleSeriesData} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b' }}
              minTickGap={18}
              tickMargin={6}
            />
            <YAxis width={42} domain={[minVal, maxVal]} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              formatter={(value: any) => [`${value} ${cfg.unit}`, cfg.label]}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
            {cfg.refHigh !== undefined && (
              <ReferenceLine y={cfg.refHigh} stroke="#f59e0b" strokeDasharray="4 4" />
            )}
            {cfg.refLow !== undefined && (
              <ReferenceLine y={cfg.refLow} stroke="#ef4444" strokeDasharray="4 4" />
            )}
            <Line
              type="monotone"
              dataKey={cfg.dataKey}
              name={`${cfg.label} (${cfg.unit})`}
              stroke={cfg.color}
              strokeWidth={2.5}
              dot={{ r: 4, fill: cfg.color, stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-4 min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-600" />
            <span>Grafik Pemantauan Klinis Pasien</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Visualisasi interaktif laporan monitoring, tren tanda vital, dan peringatan klinis aktual dari Supabase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {patients.length > 0 && (
            <select
              aria-label="Filter pasien untuk grafik"
              value={effectivePatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-500 max-w-[200px]"
            >
              <option value="all">Semua Pasien ({patients.length})</option>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {p.fullName}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  rangeDays === days
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {days} Hr
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Mode & Vital Metric Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChartMode('activity')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
              chartMode === 'activity'
                ? 'bg-teal-50 border-teal-500 text-teal-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Aktivitas & Peringatan</span>
          </button>

          <button
            type="button"
            onClick={() => setChartMode('vitals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
              chartMode === 'vitals'
                ? 'bg-teal-50 border-teal-500 text-teal-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Tren Klinis</span>
          </button>
        </div>

        {chartMode === 'vitals' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] font-medium">
            {(
              [
                { id: 'bp', label: 'TD', icon: HeartPulse },
                { id: 'temp', label: 'Suhu', icon: Thermometer },
                { id: 'pulse', label: 'Nadi', icon: Activity },
                { id: 'spo2', label: 'SpO2', icon: Droplets },
                { id: 'pain', label: 'Nyeri', icon: Flame },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setVitalMetric(item.id)}
                  className={`px-2.5 py-1 rounded-lg border whitespace-nowrap inline-flex items-center gap-1 transition-colors ${
                    vitalMetric === item.id
                      ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {renderContent()}
    </div>
  );
};
