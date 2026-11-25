/**
 * Interactive Responsive Trend Charts for NurseGo powered by Recharts
 *
 * Supports:
 * - Tekanan Darah (Sistolik & Diastolik)
 * - Suhu Tubuh (°C)
 * - Denyut Nadi (bpm)
 * - Frekuensi Pernapasan (x/menit)
 * - Saturasi Oksigen (SpO2 %)
 * - Skala Nyeri (0 - 10)
 *
 * Range filters: 7 Hari, 14 Hari, 30 Hari, Semua Data
 */

import React, { useState, useMemo } from 'react';
import { VitalSignRecord, PainRecord } from '../../types/database';
import { HeartPulse, Activity, Thermometer, Flame, Wind, Droplets } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface MetricChartProps {
  vitals: VitalSignRecord[];
  painRecords?: PainRecord[];
  isPatientView?: boolean;
}

type TimeRange = '7' | '14' | '30' | 'all';
type MetricKey = 'bp' | 'temp' | 'pulse' | 'resp' | 'spo2' | 'pain';

function buildAxisFormatter(timestamps: string[]) {
  const dayKeys = new Set<string>();
  let hasDuplicateDay = false;
  for (const iso of timestamps) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dayKeys.has(key)) {
      hasDuplicateDay = true;
      break;
    }
    dayKeys.add(key);
  }

  return (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    if (!hasDuplicateDay) return datePart;
    const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  };
}

export const MetricChartsView: React.FC<MetricChartProps> = ({
  vitals,
  painRecords = [],
  isPatientView = false,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('14');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('bp');

  const filterByDate = (dateStr: string) => {
    if (timeRange === 'all') return true;
    const daysLimit = Number(timeRange);
    const diffDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= daysLimit;
  };

  const filteredVitals = useMemo(
    () =>
      [...vitals]
        .filter((v) => filterByDate(v.recorded_at))
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()),
    [vitals, timeRange]
  );

  const filteredPain = useMemo(
    () =>
      [...painRecords]
        .filter((p) => filterByDate(p.recorded_at))
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()),
    [painRecords, timeRange]
  );

  const formatTooltipDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return `${d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })} · ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const rangeLabel = timeRange === 'all' ? 'seluruh riwayat' : `${timeRange} hari terakhir`;

  const renderChartBody = () => {
    if (selectedMetric === 'pain') {
      if (filteredPain.length === 0) {
        return (
          <div className="h-[260px] flex flex-col items-center justify-center text-xs text-slate-400 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-4 text-center">
            <Flame className="w-8 h-8 text-slate-300 mb-2" />
            <span>Belum ada data pemantauan nyeri pada {rangeLabel}.</span>
          </div>
        );
      }

      const formatAxisDate = buildAxisFormatter(filteredPain.map((p) => p.recorded_at));
      const data = filteredPain.map((p) => ({
        date: formatAxisDate(p.recorded_at),
        fullDate: formatTooltipDate(p.recorded_at),
        pain: Number(p.pain_scale),
        location: p.location,
      }));

      const avg = (filteredPain.reduce((a, b) => a + Number(b.pain_scale), 0) / filteredPain.length).toFixed(1);

      return (
        <div className="space-y-3 min-w-0">
          <div className="h-[270px] sm:h-[310px] w-full min-w-0 bg-slate-50/50 rounded-xl p-2 sm:p-4 border border-slate-200">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <AreaChart data={data} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="painGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  minTickGap={16}
                  tickMargin={6}
                />
                <YAxis
                  width={36}
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  formatter={(value: any) => [`${value} / 10`, 'Skala Nyeri']}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }} />
                <ReferenceLine
                  y={6}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'Sedang-Berat (6)', position: 'insideTopRight', fontSize: 10, fill: '#b45309' }}
                />
                <Area
                  type="monotone"
                  dataKey="pain"
                  name="Skala Nyeri (0–10)"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fill="url(#painGrad)"
                  dot={{ r: 4, fill: '#0f766e', stroke: '#fff', strokeWidth: 1.5 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
            <span>Panduan: 0 Bebas Nyeri · 1–3 Ringan · 4–6 Sedang · 7–10 Berat</span>
            <span className="font-bold text-teal-800 tabular-nums">Rata-rata: {avg}/10</span>
          </div>
        </div>
      );
    }

    if (filteredVitals.length === 0) {
      return (
        <div className="h-[260px] flex flex-col items-center justify-center text-xs text-slate-400 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 p-4 text-center">
          <HeartPulse className="w-8 h-8 text-slate-300 mb-2" />
          <span>Belum ada data tanda vital pada {rangeLabel}.</span>
        </div>
      );
    }

    const formatAxisDate = buildAxisFormatter(filteredVitals.map((v) => v.recorded_at));

    if (selectedMetric === 'bp') {
      const data = filteredVitals.map((v) => ({
        date: formatAxisDate(v.recorded_at),
        fullDate: formatTooltipDate(v.recorded_at),
        systolic: Number(v.systolic_bp),
        diastolic: Number(v.diastolic_bp),
      }));
      const latest = filteredVitals[filteredVitals.length - 1];
      const allBpValues = data.flatMap((d) => [d.systolic, d.diastolic]).filter((n) => Number.isFinite(n));
      const minBp = Math.max(40, Math.floor((Math.min(...allBpValues) - 10) / 10) * 10);
      const maxBp = Math.min(220, Math.ceil((Math.max(...allBpValues, 145) + 10) / 10) * 10);

      return (
        <div className="space-y-3 min-w-0">
          <div className="h-[270px] sm:h-[310px] w-full min-w-0 bg-slate-50/50 rounded-xl p-2 sm:p-4 border border-slate-200">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <LineChart data={data} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  minTickGap={16}
                  tickMargin={6}
                />
                <YAxis
                  width={40}
                  domain={[minBp, maxBp]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  formatter={(value: any, name: any) => [`${value} mmHg`, String(name ?? '')]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }} />
                <ReferenceLine
                  y={140}
                  stroke="#f43f5e"
                  strokeDasharray="3 3"
                  label={{ value: 'Batas 140', position: 'insideTopRight', fontSize: 10, fill: '#e11d48' }}
                />
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
            <span>Target normal klinis: 100/60 – 129/84 mmHg</span>
            <span className="font-bold text-slate-900 tabular-nums">
              Terakhir: {latest.systolic_bp}/{latest.diastolic_bp} mmHg
            </span>
          </div>
        </div>
      );
    }

    const singleConfig: Record<
      'temp' | 'pulse' | 'resp' | 'spo2',
      {
        key: keyof VitalSignRecord;
        label: string;
        unit: string;
        color: string;
        target: string;
        pad: number;
        minFloor: number;
        maxCeil: number;
        refHigh?: number;
        refLow?: number;
      }
    > = {
      temp: {
        key: 'body_temperature',
        label: 'Suhu Tubuh',
        unit: '°C',
        color: '#f97316',
        target: '36.5 – 37.5 °C',
        pad: 0.5,
        minFloor: 34,
        maxCeil: 41,
        refHigh: 37.8,
      },
      pulse: {
        key: 'heart_rate',
        label: 'Denyut Nadi',
        unit: 'bpm',
        color: '#e11d48',
        target: '60 – 100 bpm',
        pad: 8,
        minFloor: 40,
        maxCeil: 180,
        refHigh: 100,
      },
      resp: {
        key: 'respiratory_rate',
        label: 'Frekuensi Napas',
        unit: 'x/mnt',
        color: '#0284c7',
        target: '12 – 20 x/menit',
        pad: 3,
        minFloor: 8,
        maxCeil: 40,
        refHigh: 22,
      },
      spo2: {
        key: 'oxygen_saturation',
        label: 'Saturasi Oksigen (SpO2)',
        unit: '%',
        color: '#10b981',
        target: '95 – 100 %',
        pad: 2,
        minFloor: 80,
        maxCeil: 100,
        refLow: 94,
      },
    };

    const cfg = singleConfig[selectedMetric];
    const data = filteredVitals.map((v) => ({
      date: formatAxisDate(v.recorded_at),
      fullDate: formatTooltipDate(v.recorded_at),
      val: Number(v[cfg.key]),
    }));
    const latest = filteredVitals[filteredVitals.length - 1];
    const vals = data.map((d) => d.val).filter((n) => Number.isFinite(n));
    const minRef = cfg.refLow ?? Math.min(...vals);
    const maxRef = cfg.refHigh ?? Math.max(...vals);
    const domainMin = Math.max(cfg.minFloor, Number((Math.min(...vals, minRef) - cfg.pad).toFixed(1)));
    const domainMax = Math.min(cfg.maxCeil, Number((Math.max(...vals, maxRef) + cfg.pad).toFixed(1)));

    return (
      <div className="space-y-3 min-w-0">
        <div className="h-[270px] sm:h-[310px] w-full min-w-0 bg-slate-50/50 rounded-xl p-2 sm:p-4 border border-slate-200">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
            <LineChart data={data} margin={{ top: 14, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#64748b' }}
                minTickGap={16}
                tickMargin={6}
              />
              <YAxis
                width={42}
                domain={[domainMin, domainMax]}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                formatter={(value: any) => [`${value} ${cfg.unit}`, cfg.label]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }} />
              {cfg.refHigh && (
                <ReferenceLine y={cfg.refHigh} stroke="#f59e0b" strokeDasharray="4 4" />
              )}
              {cfg.refLow && (
                <ReferenceLine y={cfg.refLow} stroke="#ef4444" strokeDasharray="4 4" />
              )}
              <Line
                type="monotone"
                dataKey="val"
                name={`${cfg.label} (${cfg.unit})`}
                stroke={cfg.color}
                strokeWidth={2.5}
                dot={{ r: 4, fill: cfg.color, stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
          <span>
            Rentang Normal Klinis: <strong className="text-slate-800">{cfg.target}</strong>
          </span>
          <span className="font-bold text-slate-900 tabular-nums">
            Nilai Terakhir: {String(latest[cfg.key])} {cfg.unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-5 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-sm text-slate-900">
            {isPatientView ? 'Grafik Perkembangan Pemulihan Anda' : 'Grafik Pemantauan Parameter Klinis'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Arahkan kursor atau ketuk titik data untuk melihat rincian waktu dan nilai pengukuran.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-center">
          {(
            [
              { id: '7', label: '7 Hari' },
              { id: '14', label: '14 Hari' },
              { id: '30', label: '30 Hari' },
              { id: 'all', label: 'Semua' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setTimeRange(r.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                timeRange === r.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => setSelectedMetric('bp')}
          className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedMetric === 'bp'
              ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <HeartPulse className="w-3.5 h-3.5 text-teal-600" />
          <span>Tekanan Darah</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMetric('temp')}
          className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedMetric === 'temp'
              ? 'bg-orange-50 border-orange-500 text-orange-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Thermometer className="w-3.5 h-3.5 text-orange-600" />
          <span>Suhu Tubuh</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMetric('pulse')}
          className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedMetric === 'pulse'
              ? 'bg-rose-50 border-rose-500 text-rose-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-rose-600" />
          <span>Denyut Nadi</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMetric('resp')}
          className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedMetric === 'resp'
              ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wind className="w-3.5 h-3.5 text-blue-600" />
          <span>Pernapasan</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMetric('spo2')}
          className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedMetric === 'spo2'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Droplets className="w-3.5 h-3.5 text-emerald-600" />
          <span>SpO2</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedMetric('pain')}
          className={`px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            selectedMetric === 'pain'
              ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-teal-600" />
          <span>Skala Nyeri</span>
        </button>
      </div>

      {renderChartBody()}
    </div>
  );
};
