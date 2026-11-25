/**
 * Database types and interfaces for NurseGo
 * Postoperative Home Care Monitoring System
 */

export type UserRole = 'nurse' | 'patient';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'needs_revision';
export type AlertLevel = 'waspada' | 'urgent' | 'darurat';
export type AlertStatus = 'aktif' | 'ditinjau' | 'selesai';
export type GeneralCondition = 'sangat_baik' | 'baik' | 'biasa_saja' | 'kurang_baik' | 'buruk' | 'membaik' | 'sama' | 'memburuk';
export type AdherenceStatus = 'diminum' | 'terlambat' | 'tidak_diminum' | 'belum_diketahui';
export type AppointmentStatus = 'terjadwal' | 'selesai' | 'dibatalkan';
export type AssignmentStatus = 'active' | 'pending_nurse' | 'pending_patient' | 'rejected' | 'ended';

export type NurseEducationLevel = 
  | 'd3_keperawatan'
  | 's1_keperawatan'
  | 's2_keperawatan'
  | 's2_kesehatan_lain'
  | 's3_keperawatan'
  | 's3_kesehatan_lain'
  | 'spesialis_keperawatan';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NurseProfile {
  id: string; // matches auth.uid()
  str_number: string;
  str_expiry_date?: string;
  verification_status: VerificationStatus;
  education_level?: NurseEducationLevel;
  has_ners_profession: boolean;
  academic_degree?: string; // e.g. S.Kep., M.Kep., Sp.Kep.MB
  professional_title?: string; // Formed title e.g. Ns. Andi Pratama, S.Kep., M.Kep.
  department?: string;
  hospital_name?: string;
  str_document_url?: string;
  diploma_document_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PatientProfile {
  id: string; // matches auth.uid()
  date_of_birth?: string;
  gender?: 'L' | 'P' | 'Laki-laki' | 'Perempuan';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  address?: string;
  medical_history?: string; // Riwayat penyakit
  allergies?: string; // Alergi
  created_at?: string;
  updated_at?: string;
}

export interface SurgeryType {
  id: string | number;
  name: string;
  code?: string;
  category?: string;
  estimated_recovery_days?: number;
  description?: string;
  is_mvp?: boolean;
  created_at?: string;
}

export interface PatientSurgery {
  id: string;
  patient_id: string;
  surgery_type_id: string | number;
  surgery_date: string;
  discharge_date?: string;
  surgeon_name?: string;
  hospital_name?: string;
  notes?: string;
  status?: string;
  created_at?: string;
  surgery_type?: SurgeryType;
}

export interface PatientNurseAssignment {
  id: string;
  patient_id: string;
  nurse_id: string;
  is_active: boolean;
  status?: AssignmentStatus;
  initiated_by?: string | null;
  relationship_role?: string;
  notes?: string | null;
  assigned_at?: string;
  patient_approved_at?: string | null;
  nurse_approved_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  patient?: Profile & { patient_profile?: PatientProfile; surgery?: PatientSurgery };
  nurse?: Profile & { nurse_profile?: NurseProfile };
}

export interface RelationshipSummary {
  id: string;
  patient_id: string;
  nurse_id: string;
  is_active: boolean;
  status: AssignmentStatus;
  initiated_by?: string | null;
  relationship_role?: string;
  notes?: string | null;
  assigned_at?: string;
  patient_approved_at?: string | null;
  nurse_approved_at?: string | null;
  ended_at?: string | null;
  counterpart_id: string;
  counterpart_role: UserRole;
  counterpart_name: string;
  counterpart_email: string;
  counterpart_phone?: string | null;
  professional_title?: string | null;
  hospital_name?: string | null;
  department?: string | null;
  verification_status?: VerificationStatus | null;
  education_level?: NurseEducationLevel | null;
  has_ners_profession?: boolean | null;
  academic_degree?: string | null;
}

export interface PatientInvitation {
  id: string;
  nurse_id: string;
  patient_email: string;
  patient_name: string;
  patient_phone?: string;
  date_of_birth?: string;
  gender?: string;
  surgery_type_id?: number | string;
  surgery_date?: string;
  discharge_date?: string;
  surgeon_name?: string;
  hospital_name?: string;
  clinical_notes?: string;
  token: string;
  status: 'pending' | 'sent' | 'delivered' | 'accepted' | 'expired';
  expires_at?: string;
  accepted_by?: string;
  accepted_at?: string;
  created_at?: string;
  surgery_type?: SurgeryType;
}

export interface VitalSignRecord {
  id: string;
  patient_id: string;
  recorded_by?: string;
  recorded_at: string;
  systolic_bp: number;
  diastolic_bp: number;
  heart_rate: number;
  respiratory_rate: number;
  body_temperature: number;
  oxygen_saturation: number;
  notes?: string;
  created_at?: string;
}

export interface PainRecord {
  id: string;
  patient_id: string;
  recorded_by?: string;
  recorded_at: string;
  pain_scale: number; // 0 - 10
  location: string;
  characteristics: string; // berdenyut, tertusuk, terbakar, tumpul, hilang timbul
  aggravating_factors?: string;
  relieving_factors?: string;
  notes?: string;
  created_at?: string;
}

export interface SymptomRecord {
  id: string;
  patient_id: string;
  recorded_by?: string;
  recorded_at: string;
  symptoms: string[]; // e.g. ["Demam", "Mual", "Muntah", "Pusing", "Sesak napas", "Batuk", "Lemas", "Nafsu makan menurun", "Gangguan buang air"]
  general_condition: GeneralCondition;
  symptom_trend?: string;
  notes?: string;
  created_at?: string;
}

export interface WoundRecord {
  id: string;
  patient_id: string;
  recorded_by?: string;
  recorded_at: string;
  is_normal?: boolean;
  has_redness: boolean;
  has_swelling: boolean;
  has_warmth: boolean;
  has_discharge_or_pus: boolean;
  has_bleeding: boolean;
  has_open_wound: boolean;
  has_increased_pain: boolean;
  notes?: string;
  created_at?: string;
}

export interface PatientAlert {
  id: string;
  patient_id: string;
  alert_level: AlertLevel;
  title: string;
  description: string;
  trigger_source: 'vital_sign' | 'pain' | 'symptom' | 'wound' | 'general';
  status: AlertStatus;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  patient?: Profile;
}

export interface PatientAlertEvent {
  id: string;
  alert_id: string;
  event_type: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface NursingCarePlan {
  id: string;
  patient_id: string;
  nurse_id: string;
  assessment: string; // Pengkajian
  subjective_data?: string;
  objective_data?: string;
  nursing_diagnosis: string; // SDKI
  goals_outcomes: string; // SLKI
  interventions: string; // SIKI
  implementation: string; // Implementasi
  evaluation: string; // SOAP Evaluasi
  created_at: string;
  updated_at?: string;
  patient?: Profile;
  nurse?: Profile;
}

export interface PatientMedication {
  id: string;
  patient_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_at?: string;
}

export interface MedicationAdherenceLog {
  id: string;
  medication_id: string;
  patient_id: string;
  scheduled_time: string;
  taken_time?: string;
  status: AdherenceStatus;
  notes?: string;
  created_at?: string;
  medication?: PatientMedication;
}

export interface PatientAppointment {
  id: string;
  patient_id: string;
  nurse_id?: string;
  appointment_date: string;
  appointment_time?: string;
  location: string;
  doctor_name?: string;
  notes?: string;
  status: AppointmentStatus;
  created_at?: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  role: UserRole;
  title: string;
  message: string;
  type: 'alert' | 'monitoring' | 'medication' | 'appointment' | 'system';
  is_read: boolean;
  created_at: string;
  link_target?: string;
}

export interface PostOpEducation {
  id: string;
  surgery_name: string;
  surgery_slug: string;
  short_summary: string;
  wound_care: string[];
  activity_mobilization: string[];
  hygiene: string[];
  nutrition: string[];
  medications: string[];
  danger_signs: string[];
  follow_up: string[];
}

export interface PatientMessage {
  id: string;
  patient_id: string;
  nurse_id: string;
  sender_id: string;
  sender_role: UserRole;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface PatientEducationAssignment {
  id: string;
  patient_id: string;
  nurse_id: string;
  title: string;
  category: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

