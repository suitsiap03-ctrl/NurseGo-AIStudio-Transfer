/**
 * Pure validation and token generation helpers for NurseGo Patient Invitations.
 */

import { getLocalDateInputValue } from './dateUtils';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface InviteValidationInput {
  mode: 'invite' | 'link';
  patientName: string;
  patientEmail: string;
  dateOfBirth?: string;
  selectedSurgeryTypeId?: string;
  surgeryDate?: string;
  dischargeDate?: string;
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidIsoDateOnly(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export function generateInvitationToken(length = 8): string {
  const chars: string[] = [];
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      chars.push(TOKEN_CHARSET[buf[i] % TOKEN_CHARSET.length]);
    }
  } else {
    for (let i = 0; i < length; i++) {
      chars.push(TOKEN_CHARSET[Math.floor(Math.random() * TOKEN_CHARSET.length)]);
    }
  }
  return `INV-${chars.join('')}`;
}

export function isValidInvitationToken(token: string): boolean {
  return /^INV-[A-Z0-9]{6,12}$/.test(token.trim().toUpperCase());
}

export function validatePatientModalInput(input: InviteValidationInput): string | null {
  const cleanEmail = input.patientEmail.trim();
  if (!cleanEmail) {
    return 'Mohon masukkan alamat email pasien.';
  }
  if (!isValidEmailFormat(cleanEmail)) {
    return 'Format alamat email pasien tidak valid.';
  }

  if (input.mode === 'link') {
    return null;
  }

  if (!input.patientName.trim()) {
    return 'Mohon lengkapi nama lengkap pasien.';
  }
  if (!input.selectedSurgeryTypeId || !input.selectedSurgeryTypeId.trim()) {
    return 'Mohon pilih jenis operasi pascaoperasi.';
  }

  const todayStr = getLocalDateInputValue();

  if (input.dateOfBirth && input.dateOfBirth.trim()) {
    const dob = input.dateOfBirth.trim();
    if (!isValidIsoDateOnly(dob)) {
      return 'Format tanggal lahir tidak valid.';
    }
    if (dob > todayStr) {
      return 'Tanggal lahir tidak boleh di masa depan.';
    }
  }

  const cleanSurgeryDate = input.surgeryDate?.trim() || '';
  const cleanDischargeDate = input.dischargeDate?.trim() || '';

  if (cleanSurgeryDate && !isValidIsoDateOnly(cleanSurgeryDate)) {
    return 'Format tanggal operasi tidak valid.';
  }
  if (cleanDischargeDate && !isValidIsoDateOnly(cleanDischargeDate)) {
    return 'Format tanggal pulang tidak valid.';
  }
  if (cleanSurgeryDate && cleanDischargeDate && cleanDischargeDate < cleanSurgeryDate) {
    return 'Tanggal pulang tidak boleh lebih awal dari tanggal operasi.';
  }

  return null;
}
