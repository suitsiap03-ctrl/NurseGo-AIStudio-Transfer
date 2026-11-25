/**
 * Clinical Monitoring Triage Rules for NurseGo
 * 
 * DISCLAIMER MEDIS:
 * Sistem ini merupakan bantuan pemantauan klinis keperawatan dan pengenalan dini
 * kegawatdaruratan pascaoperasi di rumah, bukan diagnosis definitif medis.
 */

import { AlertLevel, VitalSignRecord, PainRecord, SymptomRecord, WoundRecord } from '../types/database';

export interface EvaluatedAlert {
  alertLevel: AlertLevel;
  title: string;
  description: string;
  triggerSource: 'vital_sign' | 'pain' | 'symptom' | 'wound' | 'general';
  clinicalRationale: string[];
}

export function evaluateClinicalMonitoring(data: {
  vitals?: Partial<VitalSignRecord>;
  pain?: Partial<PainRecord>;
  symptoms?: Partial<SymptomRecord>;
  wound?: Partial<WoundRecord>;
}): EvaluatedAlert | null {
  const flags: { level: AlertLevel; source: 'vital_sign' | 'pain' | 'symptom' | 'wound' | 'general'; note: string }[] = [];

  // 1. Tanda Vital Evaluation
  if (data.vitals) {
    const { systolic_bp, diastolic_bp, heart_rate, respiratory_rate, body_temperature, oxygen_saturation } = data.vitals;

    // Tekanan Darah
    if (systolic_bp !== undefined && diastolic_bp !== undefined) {
      if (systolic_bp >= 160 || diastolic_bp >= 100 || systolic_bp < 80) {
        flags.push({
          level: 'darurat',
          source: 'vital_sign',
          note: `Tekanan darah sangat abnormal: ${systolic_bp}/${diastolic_bp} mmHg (krisis hipertensi atau hipotensi berat/syok).`,
        });
      } else if (systolic_bp >= 140 || diastolic_bp >= 90 || systolic_bp < 90) {
        flags.push({
          level: 'urgent',
          source: 'vital_sign',
          note: `Tekanan darah hipertensi derajat 1 atau hipotensi: ${systolic_bp}/${diastolic_bp} mmHg.`,
        });
      } else if (systolic_bp >= 130 || diastolic_bp >= 85) {
        flags.push({
          level: 'waspada',
          source: 'vital_sign',
          note: `Tekanan darah kategori pre-hipertensi: ${systolic_bp}/${diastolic_bp} mmHg.`,
        });
      }
    }

    // Suhu Tubuh
    if (body_temperature !== undefined) {
      if (body_temperature >= 39.0 || body_temperature < 35.5) {
        flags.push({
          level: 'darurat',
          source: 'vital_sign',
          note: `Suhu tubuh kritis: ${body_temperature}°C (demam tinggi/hiperpireksia atau hipotermia).`,
        });
      } else if (body_temperature >= 38.0) {
        flags.push({
          level: 'urgent',
          source: 'vital_sign',
          note: `Suhu tubuh demam febris: ${body_temperature}°C (indikasi respon inflamasi/infeksi pascaoperasi).`,
        });
      } else if (body_temperature >= 37.5) {
        flags.push({
          level: 'waspada',
          source: 'vital_sign',
          note: `Suhu tubuh subfebris: ${body_temperature}°C.`,
        });
      }
    }

    // Frekuensi Pernapasan
    if (respiratory_rate !== undefined) {
      if (respiratory_rate > 28 || respiratory_rate < 10) {
        flags.push({
          level: 'darurat',
          source: 'vital_sign',
          note: `Frekuensi napas kritis: ${respiratory_rate} x/menit (takipnea berat atau bradipnea).`,
        });
      } else if (respiratory_rate >= 25) {
        flags.push({
          level: 'urgent',
          source: 'vital_sign',
          note: `Frekuensi napas meningkat: ${respiratory_rate} x/menit.`,
        });
      } else if (respiratory_rate >= 21) {
        flags.push({
          level: 'waspada',
          source: 'vital_sign',
          note: `Frekuensi napas batas atas normal: ${respiratory_rate} x/menit.`,
        });
      }
    }

    // Denyut Nadi
    if (heart_rate !== undefined) {
      if (heart_rate > 125 || heart_rate < 50) {
        flags.push({
          level: 'darurat',
          source: 'vital_sign',
          note: `Denyut nadi kritis: ${heart_rate} bpm (takikardia/bradikardia berat).`,
        });
      } else if (heart_rate > 105 || heart_rate < 55) {
        flags.push({
          level: 'urgent',
          source: 'vital_sign',
          note: `Denyut nadi di luar rentang normal: ${heart_rate} bpm.`,
        });
      } else if (heart_rate > 95) {
        flags.push({
          level: 'waspada',
          source: 'vital_sign',
          note: `Denyut nadi batas atas: ${heart_rate} bpm.`,
        });
      }
    }

    // Saturasi Oksigen SpO2
    if (oxygen_saturation !== undefined) {
      if (oxygen_saturation < 93) {
        flags.push({
          level: 'darurat',
          source: 'vital_sign',
          note: `Saturasi oksigen sangat rendah: SpO2 ${oxygen_saturation}% (hipoksemia).`,
        });
      } else if (oxygen_saturation < 95) {
        flags.push({
          level: 'urgent',
          source: 'vital_sign',
          note: `Saturasi oksigen di bawah target optimal: SpO2 ${oxygen_saturation}%.`,
        });
      }
    }
  }

  // 2. Skala Nyeri Evaluation
  if (data.pain && data.pain.pain_scale !== undefined) {
    const scale = data.pain.pain_scale;
    if (scale >= 9) {
      flags.push({
        level: 'darurat',
        source: 'pain',
        note: `Skala nyeri ekstrem: ${scale}/10 di area ${data.pain.location || 'operasi'}.`,
      });
    } else if (scale >= 7) {
      flags.push({
        level: 'urgent',
        source: 'pain',
        note: `Skala nyeri berat: ${scale}/10 memerlukan penyesuaian analgetik.`,
      });
    } else if (scale >= 4) {
      flags.push({
        level: 'waspada',
        source: 'pain',
        note: `Skala nyeri sedang: ${scale}/10 perlu dipantau efektivitas obat pereda nyeri.`,
      });
    }
  }

  // 3. Kondisi Luka Operasi Evaluation
  if (data.wound) {
    const { has_discharge_or_pus, has_bleeding, has_open_wound, has_increased_pain, has_redness, has_swelling, has_warmth } = data.wound;
    
    if (has_discharge_or_pus || has_open_wound || has_bleeding) {
      const redFlags = [];
      if (has_discharge_or_pus) redFlags.push('cairan keruh/nanah');
      if (has_open_wound) redFlags.push('tepi luka jahitan terbuka');
      if (has_bleeding) redFlags.push('perdarahan aktif');

      flags.push({
        level: 'darurat',
        source: 'wound',
        note: `Tanda komplikasi luka serius: ${redFlags.join(', ')}.`,
      });
    } else if (has_increased_pain || (has_redness && has_swelling && has_warmth)) {
      flags.push({
        level: 'urgent',
        source: 'wound',
        note: `Tanda tanda inflamasi akut atau infeksi lokal (kalor, rubor, tumor, dolor meningkat).`,
      });
    } else if (has_redness || has_swelling) {
      flags.push({
        level: 'waspada',
        source: 'wound',
        note: `Kemerahan atau bengkak ringan di sekitar insisi operasi.`,
      });
    }
  }

  // 4. Gejala & Kondisi Umum
  if (data.symptoms) {
    const cond = data.symptoms.general_condition;
    const trend = data.symptoms.symptom_trend;
    const symptomCount = data.symptoms.symptoms?.length || 0;

    if (cond === 'buruk' || cond === 'memburuk' || trend === 'memburuk') {
      flags.push({
        level: 'urgent',
        source: 'symptom',
        note: 'Pasien melaporkan kondisi umum buruk atau keluhan dirasakan memburuk dibanding hari sebelumnya.',
      });
    } else if (
      cond === 'kurang_baik' ||
      ((cond === 'sama' || trend === 'sama') && symptomCount >= 3)
    ) {
      flags.push({
        level: 'waspada',
        source: 'symptom',
        note:
          symptomCount > 0
            ? `Kondisi kurang optimal dengan keluhan: ${(data.symptoms.symptoms || []).join(', ')}.`
            : 'Pasien melaporkan kondisi umum kurang baik dan perlu tindak lanjut perawat.',
      });
    }
  }

  if (flags.length === 0) {
    return null;
  }

  // Determine highest priority level
  const hasDarurat = flags.some((f) => f.level === 'darurat');
  const hasUrgent = flags.some((f) => f.level === 'urgent');

  let finalLevel: AlertLevel = 'waspada';
  if (hasDarurat) {
    finalLevel = 'darurat';
  } else if (hasUrgent) {
    finalLevel = 'urgent';
  }

  // Select primary trigger source
  const primaryFlag = flags.find((f) => f.level === finalLevel) || flags[0];

  const titleMap: Record<AlertLevel, string> = {
    darurat: 'Peringatan Darurat: Kondisi Pascaoperasi Memerlukan Penanganan Segera',
    urgent: 'Peringatan Urgent: Perubahan Kondisi Pasien Perlu Ditinjau Perawat Segera',
    waspada: 'Peringatan Waspada: Terdeteksi Parameter Pemantauan yang Perlu Diperhatikan',
  };

  const rationales = flags.map((f) => `[${f.level.toUpperCase()}] ${f.note}`);

  return {
    alertLevel: finalLevel,
    title: titleMap[finalLevel],
    description: rationales.join(' | '),
    triggerSource: primaryFlag.source,
    clinicalRationale: rationales,
  };
}
