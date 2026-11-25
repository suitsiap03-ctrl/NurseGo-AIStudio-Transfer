/**
 * Canonical 7 MVP Postoperative Surgery Templates & Matching Utilities
 */

import { PostOpEducation, SurgeryType } from '../types/database';
import { SURGERY_EDUCATION_DATA } from '../data/educationData';

export interface MvpSurgeryDefinition {
  canonicalName: string;
  code: string;
  category: string;
  estimatedRecoveryDays: number;
  keywords: string[];
  educationSlug: string;
}

export const MVP_SURGERY_DEFINITIONS: MvpSurgeryDefinition[] = [
  {
    canonicalName: 'Apendektomi',
    code: 'APP-01',
    category: 'Bedah Digestif',
    estimatedRecoveryDays: 14,
    keywords: ['apendektomi', 'usus buntu'],
    educationSlug: 'apendektomi',
  },
  {
    canonicalName: 'Sectio Caesarea (SC)',
    code: 'OBS-01',
    category: 'Obstetri & Ginekologi',
    estimatedRecoveryDays: 28,
    keywords: ['sectio', 'caesarea', 'caesar', 'sesar'],
    educationSlug: 'sectio-caesarea',
  },
  {
    canonicalName: 'Herniorafi',
    code: 'DIG-03',
    category: 'Bedah Umum',
    estimatedRecoveryDays: 21,
    keywords: ['herniorafi', 'hernia'],
    educationSlug: 'herniorafi',
  },
  {
    canonicalName: 'Total Knee Replacement (TKR)',
    code: 'ORT-TKR',
    category: 'Bedah Ortopedi',
    estimatedRecoveryDays: 42,
    keywords: ['total knee', 'tkr', 'lutut'],
    educationSlug: 'tkr',
  },
  {
    canonicalName: 'ORIF',
    code: 'ORT-ORIF',
    category: 'Bedah Ortopedi',
    estimatedRecoveryDays: 42,
    keywords: ['orif', 'open reduction', 'fiksasi', 'patah tulang'],
    educationSlug: 'orif',
  },
  {
    canonicalName: 'Kolesistektomi',
    code: 'DIG-02',
    category: 'Bedah Digestif',
    estimatedRecoveryDays: 14,
    keywords: ['kolesistektomi', 'empedu'],
    educationSlug: 'kolesistektomi',
  },
  {
    canonicalName: 'Mastektomi',
    code: 'ONK-01',
    category: 'Bedah Onkologi',
    estimatedRecoveryDays: 28,
    keywords: ['mastektomi', 'payudara'],
    educationSlug: 'mastektomi',
  },
];

export const FALLBACK_MVP_SURGERY_TYPES: SurgeryType[] = MVP_SURGERY_DEFINITIONS.map((def, idx) => ({
  id: idx + 1,
  name: def.canonicalName,
  code: def.code,
  category: def.category,
  estimated_recovery_days: def.estimatedRecoveryDays,
  is_mvp: true,
}));

export function matchMvpDefinition(name?: string | null): MvpSurgeryDefinition | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  return MVP_SURGERY_DEFINITIONS.find((def) =>
    def.keywords.some((kw) => lower.includes(kw))
  );
}

/**
 * Filters database `surgery_types` rows to strictly the 7 canonical MVP surgery templates.
 * Handles databases before and after `003_relationship_consent_and_surgery_mvp.sql` is applied.
 */
export function filterAndNormalizeMvpSurgeryTypes(rows: SurgeryType[] | null | undefined): SurgeryType[] {
  if (!rows || rows.length === 0) return [];

  const byCanonical = new Map<string, SurgeryType>();

  for (const row of rows) {
    if (row.is_mvp === false) continue;
    const def = matchMvpDefinition(row.name);
    if (!def) continue;

    const existing = byCanonical.get(def.canonicalName);
    // Prefer exact canonical name row if duplicate legacy alias exists
    if (!existing || row.name === def.canonicalName) {
      byCanonical.set(def.canonicalName, {
        ...row,
        name: def.canonicalName,
        code: row.code || def.code,
        category: row.category || def.category,
        estimated_recovery_days: row.estimated_recovery_days || def.estimatedRecoveryDays,
        is_mvp: true,
      });
    }
  }

  return MVP_SURGERY_DEFINITIONS
    .map((def) => byCanonical.get(def.canonicalName))
    .filter((item): item is SurgeryType => Boolean(item));
}

export function matchEducationBySurgeryName(surgeryName?: string | null): PostOpEducation {
  const def = matchMvpDefinition(surgeryName);
  if (def) {
    const matched = SURGERY_EDUCATION_DATA.find((e) => e.surgery_slug === def.educationSlug);
    if (matched) return matched;
  }

  const lower = (surgeryName || '').toLowerCase();
  if (lower.includes('ortopedi') || lower.includes('fraktur')) {
    return SURGERY_EDUCATION_DATA.find((e) => e.surgery_slug === 'orif') || SURGERY_EDUCATION_DATA[0];
  }

  return SURGERY_EDUCATION_DATA[0];
}
