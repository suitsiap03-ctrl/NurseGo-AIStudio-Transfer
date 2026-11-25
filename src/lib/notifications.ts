/**
 * Persistent Notification Helpers for NurseGo
 * - Inserts notifications directly into Supabase `notifications` table
 * - Parses structured `link_target` strings cleanly across portals
 */

import { getSupabase } from './supabaseClient';
import { isApprovedActiveAssignment } from './nurseRelationships';
import { UserRole } from '../types/database';

export interface CreateNotificationInput {
  userId: string;
  role: UserRole;
  title: string;
  message: string;
  type: 'alert' | 'monitoring' | 'medication' | 'appointment' | 'system';
  linkTarget?: string;
}

export async function createNotification(input: CreateNotificationInput): Promise<boolean> {
  if (!input.userId) return false;
  const supabase = getSupabase();
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: input.userId,
      role: input.role,
      title: input.title,
      message: input.message,
      type: input.type,
      is_read: false,
      link_target: input.linkTarget || null,
    });
    if (error) {
      console.warn('NurseGo notification insert warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('NurseGo notification error:', err);
    return false;
  }
}

export async function notifyAssignedNurses(
  patientId: string,
  payload: Omit<CreateNotificationInput, 'userId' | 'role'>
): Promise<void> {
  const supabase = getSupabase();
  try {
    const { data: assignments, error } = await supabase
      .from('patient_nurse_assignments')
      .select('nurse_id, is_active, status, ended_at')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .is('ended_at', null);

    if (error || !assignments || assignments.length === 0) return;

    const approvedAssignments = assignments.filter((a: any) => isApprovedActiveAssignment(a));
    if (approvedAssignments.length === 0) return;

    await Promise.all(
      approvedAssignments.map((a: any) =>
        createNotification({
          userId: a.nurse_id,
          role: 'nurse',
          ...payload,
        })
      )
    );
  } catch (err) {
    console.warn('Failed notifying assigned nurses:', err);
  }
}

export interface ParsedLinkTarget {
  kind: 'patient' | 'tab' | 'unknown';
  patientId?: string;
  tab?: string;
  subtab?: string;
}

export function parseLinkTarget(raw?: string | null): ParsedLinkTarget {
  if (!raw) return { kind: 'unknown' };
  if (raw.startsWith('patient:')) {
    const [, patientId, subtab] = raw.split(':');
    return { kind: 'patient', patientId, subtab };
  }
  if (raw.startsWith('tab:')) {
    const [, tab, subtab] = raw.split(':');
    return { kind: 'tab', tab, subtab };
  }
  // Backward-compatible fallback when raw is a plain UUID patient id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw) || raw.startsWith('pat-')) {
    return { kind: 'patient', patientId: raw };
  }
  return { kind: 'tab', tab: raw };
}
