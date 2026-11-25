/**
 * Consent-Safe Nurse-Patient Relationship Resolver
 *
 * Resolves active, pending incoming, and pending outgoing relationships for a nurse
 * using the `get_my_nurse_patient_relationships` RPC when available, with automatic
 * fallback to `patient_nurse_assignments` whenever the RPC is unavailable, returns an
 * unexpected shape, or yields an empty list despite direct assignment rows existing.
 *
 * Strictly preserves consent isolation:
 * - Never treats `pending_nurse`, `pending_patient`, `rejected`, or `ended` rows as active.
 * - Exposes explicit `error` / `rpcNotice` instead of silently masking failures as empty.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRpcError } from './supabaseClient';
import { AssignmentStatus, RelationshipSummary } from '../types/database';

export interface ActiveNurseAssignment {
  id: string;
  patient_id: string;
  nurse_id: string;
  is_active: boolean;
  status?: AssignmentStatus | string | null;
  relationship_role?: string;
  assigned_at?: string;
  ended_at?: string | null;
  counterpart_name?: string;
  counterpart_email?: string;
  counterpart_phone?: string | null;
}

export interface NurseRelationshipsResult {
  active: ActiveNurseAssignment[];
  pendingIncoming: RelationshipSummary[];
  pendingOutgoing: RelationshipSummary[];
  error: string | null;
  rpcNotice: string | null;
}

const DISALLOWED_STATUSES = new Set([
  'pending_nurse',
  'pending_patient',
  'rejected',
  'ended',
  'inactive',
  'cancelled',
  'revoked',
]);

export function normalizeAssignmentStatus(status: unknown): string {
  if (typeof status !== 'string') return '';
  return status.trim().toLowerCase();
}

export function isApprovedActiveAssignment(row: {
  is_active?: boolean | null;
  status?: string | null;
  ended_at?: string | null;
}): boolean {
  if (!row || row.ended_at) return false;
  if (row.is_active !== true) return false;
  const normalized = normalizeAssignmentStatus(row.status);
  if (!normalized) {
    // Legacy rows created before `status` column existed may have `status = NULL` with `is_active = TRUE`
    return true;
  }
  if (DISALLOWED_STATUSES.has(normalized)) return false;
  return normalized === 'active' || normalized === 'aktif';
}

export function parseRpcRelationshipPayload(raw: unknown): RelationshipSummary[] | null {
  if (Array.isArray(raw)) {
    return raw as RelationshipSummary[];
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RelationshipSummary[];
    } catch {
      return null;
    }
  }
  return null;
}

function dedupeByPatientId<T extends { patient_id: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    if (!row.patient_id) continue;
    if (!seen.has(row.patient_id)) {
      seen.set(row.patient_id, row);
    }
  }
  return Array.from(seen.values());
}

export async function fetchNurseRelationships(
  supabase: SupabaseClient,
  nurseId: string
): Promise<NurseRelationshipsResult> {
  let rpcList: RelationshipSummary[] | null = null;
  let rpcErrMsg: string | null = null;
  let rpcNotice: string | null = null;

  try {
    const { data: relRpc, error: relErr } = await supabase.rpc('get_my_nurse_patient_relationships');
    if (relErr) {
      rpcErrMsg = relErr.message;
      rpcNotice = isMissingRpcError(relErr)
        ? 'Fungsi relasi multi-perawat belum tersedia di Supabase. Menggunakan kueri penugasan aktif langsung.'
        : `Fungsi relasi tidak dapat dimuat (${relErr.message}). Menggunakan kueri penugasan aktif langsung.`;
    } else {
      rpcList = parseRpcRelationshipPayload(relRpc);
      if (rpcList === null && relRpc != null) {
        rpcNotice = 'Format respons relasi tidak standar. Menggunakan kueri penugasan aktif langsung.';
      }
    }
  } catch (err: any) {
    rpcErrMsg = err?.message || 'Gagal memanggil fungsi relasi.';
    rpcNotice = `Koneksi fungsi relasi bermasalah (${rpcErrMsg}). Menggunakan kueri penugasan aktif langsung.`;
  }

  const rpcNurseRows = (rpcList || []).filter(
    (r) => r.nurse_id === nurseId || r.counterpart_role === 'patient'
  );
  const rpcActive = dedupeByPatientId(
    rpcNurseRows
      .filter((r) => isApprovedActiveAssignment(r))
      .map((r) => ({
        id: r.id,
        patient_id: r.patient_id,
        nurse_id: r.nurse_id || nurseId,
        is_active: true,
        status: r.status,
        relationship_role: r.relationship_role,
        assigned_at: r.assigned_at,
        ended_at: r.ended_at,
        counterpart_name: r.counterpart_name,
        counterpart_email: r.counterpart_email,
        counterpart_phone: r.counterpart_phone,
      }))
  );
  const rpcPendingIncoming = rpcNurseRows.filter(
    (r) => normalizeAssignmentStatus(r.status) === 'pending_nurse' && !r.ended_at
  );
  const rpcPendingOutgoing = rpcNurseRows.filter(
    (r) => normalizeAssignmentStatus(r.status) === 'pending_patient' && !r.ended_at
  );

  // If RPC succeeded AND returned at least one active or pending relationship, return immediately
  if (
    rpcList !== null &&
    !rpcErrMsg &&
    (rpcActive.length > 0 || rpcPendingIncoming.length > 0 || rpcPendingOutgoing.length > 0)
  ) {
    return {
      active: rpcActive,
      pendingIncoming: rpcPendingIncoming,
      pendingOutgoing: rpcPendingOutgoing,
      error: null,
      rpcNotice: null,
    };
  }

  // Always verify directly against `patient_nurse_assignments` when RPC failed OR returned empty
  // (protects against INNER JOIN drops or status casing/null differences in live DB)
  const { data: directRows, error: assignErr } = await supabase
    .from('patient_nurse_assignments')
    .select('*')
    .eq('nurse_id', nurseId)
    .order('assigned_at', { ascending: false });

  if (assignErr) {
    // If RPC returned a valid empty array without error, do not fail solely because direct query errored;
    // otherwise expose the concrete error so UI does not falsely show 0.
    if (rpcList !== null && !rpcErrMsg) {
      return {
        active: [],
        pendingIncoming: [],
        pendingOutgoing: [],
        error: null,
        rpcNotice: null,
      };
    }
    return {
      active: [],
      pendingIncoming: [],
      pendingOutgoing: [],
      error: `Gagal memuat daftar relasi pasien: ${assignErr.message}`,
      rpcNotice,
    };
  }

  const rows = directRows || [];
  const directActive = dedupeByPatientId(
    rows
      .filter((r: any) => isApprovedActiveAssignment(r))
      .map((r: any) => ({
        id: r.id,
        patient_id: r.patient_id,
        nurse_id: r.nurse_id,
        is_active: true,
        status: r.status,
        relationship_role: r.relationship_role,
        assigned_at: r.assigned_at,
        ended_at: r.ended_at,
      }))
  );

  // If pending rows exist in direct table (even when RPC failed or dropped inner join), enrich basic summary
  const pendingRows = rows.filter(
    (r: any) =>
      !r.ended_at &&
      (normalizeAssignmentStatus(r.status) === 'pending_nurse' ||
        normalizeAssignmentStatus(r.status) === 'pending_patient')
  );

  let pendingIncoming = rpcPendingIncoming;
  let pendingOutgoing = rpcPendingOutgoing;

  if (pendingRows.length > 0 && pendingIncoming.length === 0 && pendingOutgoing.length === 0) {
    const mapPending = (r: any): RelationshipSummary => ({
      id: r.id,
      patient_id: r.patient_id,
      nurse_id: r.nurse_id,
      is_active: Boolean(r.is_active),
      status: r.status,
      initiated_by: r.initiated_by,
      relationship_role: r.relationship_role,
      notes: r.notes,
      assigned_at: r.assigned_at,
      patient_approved_at: r.patient_approved_at,
      nurse_approved_at: r.nurse_approved_at,
      ended_at: r.ended_at,
      counterpart_id: r.patient_id,
      counterpart_role: 'patient',
      counterpart_name: `Pasien #${String(r.patient_id || '').slice(0, 6)}`,
      counterpart_email: '',
    });

    pendingIncoming = pendingRows
      .filter((r: any) => normalizeAssignmentStatus(r.status) === 'pending_nurse')
      .map(mapPending);
    pendingOutgoing = pendingRows
      .filter((r: any) => normalizeAssignmentStatus(r.status) === 'pending_patient')
      .map(mapPending);
  }

  return {
    active: directActive,
    pendingIncoming,
    pendingOutgoing,
    error: null,
    rpcNotice: directActive.length > 0 ? null : rpcNotice,
  };
}
