-- ============================================================================
-- NurseGo Comprehensive Database & Security Upgrade Migration
-- Jalankan di Supabase SQL Editor (Project: pwokxvmvyezhacjpzhuz)
-- Idempotent & aman dijalankan berulang kali.
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Core Profiles & Role Tables (ensure columns exist)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('nurse', 'patient')),
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.nurse_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  str_number TEXT NOT NULL DEFAULT '',
  str_expiry_date DATE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'needs_revision')),
  education_level TEXT,
  has_ners_profession BOOLEAN NOT NULL DEFAULT FALSE,
  academic_degree TEXT,
  professional_title TEXT,
  department TEXT,
  hospital_name TEXT,
  str_document_url TEXT,
  diploma_document_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS str_expiry_date DATE;
ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS education_level TEXT;
ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS has_ners_profession BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS academic_degree TEXT;
ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS professional_title TEXT;
ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS str_document_url TEXT;
ALTER TABLE public.nurse_profiles ADD COLUMN IF NOT EXISTS diploma_document_url TEXT;

CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_of_birth DATE,
  gender TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  address TEXT,
  medical_history TEXT,
  allergies TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS medical_history TEXT;
ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS allergies TEXT;

-- 2. Surgery Types & Patient Surgeries
CREATE TABLE IF NOT EXISTS public.surgery_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  category TEXT,
  estimated_recovery_days INTEGER DEFAULT 14,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.surgery_types (name, code, category, estimated_recovery_days, description)
VALUES
  ('Apendektomi (Usus Buntu)', 'APP-01', 'Bedah Digestif', 14, 'Operasi pengangkatan usus buntu yang meradang'),
  ('Sectio Caesarea (Operasi Caesar)', 'OBS-01', 'Obstetri & Ginekologi', 28, 'Persalinan melalui tindakan operasi pada dinding perut dan rahim'),
  ('Kolesistektomi (Empedu)', 'DIG-02', 'Bedah Digestif', 14, 'Operasi pengangkatan kantong empedu'),
  ('Herniorafi (Operasi Hernia)', 'DIG-03', 'Bedah Umum', 21, 'Perbaikan jaringan otot dinding perut akibat hernia'),
  ('Operasi Ortopedi / Fraktur', 'ORT-01', 'Bedah Ortopedi', 42, 'Tindakan operasi tulang, sendi, atau fiksasi patah tulang'),
  ('Bedah Payudara / Mastektomi', 'ONK-01', 'Bedah Onkologi', 28, 'Tindakan pembedahan pada jaringan payudara'),
  ('Operasi Jantung / Kardiothoraks', 'KRD-01', 'Bedah Kardiotoraks', 56, 'Tindakan pembedahan pada organ jantung atau rongga dada'),
  ('Tindakan Bedah Umum Lainnya', 'GEN-01', 'Bedah Umum', 14, 'Tindakan pembedahan umum pasca rawat inap')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.patient_surgeries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  surgery_type_id INTEGER REFERENCES public.surgery_types(id),
  surgery_date DATE NOT NULL,
  discharge_date DATE,
  surgeon_name TEXT,
  hospital_name TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pemulihan_rumah',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Nurse-Patient Assignments & Invitations (with full onboarding clinical metadata)
CREATE TABLE IF NOT EXISTS public.patient_nurse_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(patient_id, nurse_id)
);

CREATE TABLE IF NOT EXISTS public.patient_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nurse_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_email TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS patient_phone TEXT;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS surgery_type_id INTEGER;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS surgery_date DATE;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS discharge_date DATE;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS surgeon_name TEXT;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS hospital_name TEXT;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS clinical_notes TEXT;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS accepted_by UUID;
ALTER TABLE public.patient_invitations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- 4. Clinical Monitoring Tables
CREATE TABLE IF NOT EXISTS public.vital_sign_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  systolic_bp INTEGER NOT NULL,
  diastolic_bp INTEGER NOT NULL,
  heart_rate INTEGER NOT NULL,
  respiratory_rate INTEGER NOT NULL,
  body_temperature NUMERIC(4,1) NOT NULL,
  oxygen_saturation INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pain_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pain_scale INTEGER NOT NULL CHECK (pain_scale BETWEEN 0 AND 10),
  location TEXT NOT NULL,
  characteristics TEXT NOT NULL,
  aggravating_factors TEXT,
  relieving_factors TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.symptom_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symptoms TEXT[] NOT NULL DEFAULT '{}',
  general_condition TEXT NOT NULL DEFAULT 'baik',
  symptom_trend TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.symptom_records ADD COLUMN IF NOT EXISTS symptom_trend TEXT;

CREATE TABLE IF NOT EXISTS public.wound_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_normal BOOLEAN DEFAULT FALSE,
  has_redness BOOLEAN NOT NULL DEFAULT FALSE,
  has_swelling BOOLEAN NOT NULL DEFAULT FALSE,
  has_warmth BOOLEAN NOT NULL DEFAULT FALSE,
  has_discharge_or_pus BOOLEAN NOT NULL DEFAULT FALSE,
  has_bleeding BOOLEAN NOT NULL DEFAULT FALSE,
  has_open_wound BOOLEAN NOT NULL DEFAULT FALSE,
  has_increased_pain BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_level TEXT NOT NULL CHECK (alert_level IN ('waspada', 'urgent', 'darurat')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'ditinjau', 'selesai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS public.patient_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.patient_alerts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Care Plans, Medications, Appointments, Notifications, Messaging & Custom Education
CREATE TABLE IF NOT EXISTS public.nursing_care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assessment TEXT NOT NULL DEFAULT '',
  subjective_data TEXT,
  objective_data TEXT,
  nursing_diagnosis TEXT NOT NULL,
  goals_outcomes TEXT NOT NULL DEFAULT '',
  interventions TEXT NOT NULL DEFAULT '',
  implementation TEXT NOT NULL DEFAULT '',
  evaluation TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  instructions TEXT,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.medication_adherence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES public.patient_medications(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  taken_time TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('diminum', 'terlambat', 'tidak_diminum', 'belum_diketahui')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID REFERENCES public.profiles(id),
  appointment_date DATE NOT NULL,
  appointment_time TEXT,
  location TEXT NOT NULL,
  doctor_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'terjadwal' CHECK (status IN ('terjadwal', 'selesai', 'dibatalkan')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('nurse', 'patient')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('alert', 'monitoring', 'medication', 'appointment', 'system')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bidirectional Nurse <-> Patient Messages
CREATE TABLE IF NOT EXISTS public.patient_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('nurse', 'patient')),
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom Education Notes assigned by Nurse to Patient
CREATE TABLE IF NOT EXISTS public.patient_education_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'perawatan_umum',
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Helper Functions for RLS & Secure Invitation / Linking Flows
CREATE OR REPLACE FUNCTION public.is_assigned_nurse(target_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patient_nurse_assignments pna
    WHERE pna.patient_id = target_patient_id
      AND pna.nurse_id = auth.uid()
      AND pna.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.verify_patient_invitation(p_token TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_nurse RECORD;
  v_surgery RECORD;
BEGIN
  SELECT * INTO v_inv
  FROM public.patient_invitations
  WHERE UPPER(TRIM(token)) = UPPER(TRIM(p_token))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'Token undangan tidak ditemukan.');
  END IF;

  IF v_inv.status = 'accepted' THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'Undangan ini sudah pernah digunakan.');
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'Token undangan sudah kedaluwarsa. Hubungi perawat Anda.');
  END IF;

  IF p_email IS NOT NULL AND LENGTH(TRIM(p_email)) > 0
     AND LOWER(TRIM(v_inv.patient_email)) <> LOWER(TRIM(p_email)) THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'Email tidak sesuai dengan email pada undangan perawat.');
  END IF;

  SELECT full_name, email INTO v_nurse FROM public.profiles WHERE id = v_inv.nurse_id;
  IF v_inv.surgery_type_id IS NOT NULL THEN
    SELECT name INTO v_surgery FROM public.surgery_types WHERE id = v_inv.surgery_type_id;
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'id', v_inv.id,
    'nurse_id', v_inv.nurse_id,
    'nurse_name', COALESCE(v_nurse.full_name, 'Perawat Penanggung Jawab'),
    'patient_email', v_inv.patient_email,
    'patient_name', v_inv.patient_name,
    'surgery_type_id', v_inv.surgery_type_id,
    'surgery_name', COALESCE(v_surgery.name, NULL),
    'surgery_date', v_inv.surgery_date,
    'hospital_name', v_inv.hospital_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_patient_activation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_inv RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Sesi autentikasi belum aktif.');
  END IF;

  SELECT * INTO v_inv
  FROM public.patient_invitations
  WHERE UPPER(TRIM(token)) = UPPER(TRIM(p_token))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Undangan tidak ditemukan.');
  END IF;

  IF v_inv.status = 'accepted' AND v_inv.accepted_by IS NOT NULL AND v_inv.accepted_by <> v_uid THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Undangan sudah diaktifkan oleh akun lain.');
  END IF;

  -- Mark invitation accepted
  UPDATE public.patient_invitations
  SET status = 'accepted',
      accepted_by = v_uid,
      accepted_at = NOW()
  WHERE id = v_inv.id;

  -- Ensure patient_profile has clinical demographics from invitation
  INSERT INTO public.patient_profiles (id, date_of_birth, gender)
  VALUES (v_uid, v_inv.date_of_birth, v_inv.gender)
  ON CONFLICT (id) DO UPDATE SET
    date_of_birth = COALESCE(public.patient_profiles.date_of_birth, EXCLUDED.date_of_birth),
    gender = COALESCE(public.patient_profiles.gender, EXCLUDED.gender),
    updated_at = NOW();

  -- Create assignment if missing
  INSERT INTO public.patient_nurse_assignments (patient_id, nurse_id, is_active)
  VALUES (v_uid, v_inv.nurse_id, TRUE)
  ON CONFLICT (patient_id, nurse_id) DO UPDATE SET is_active = TRUE;

  -- Create surgery record if provided in invitation and not yet recorded
  IF v_inv.surgery_type_id IS NOT NULL AND v_inv.surgery_date IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.patient_surgeries WHERE patient_id = v_uid) THEN
      INSERT INTO public.patient_surgeries (
        patient_id, surgery_type_id, surgery_date, discharge_date, surgeon_name, hospital_name, notes, status
      ) VALUES (
        v_uid, v_inv.surgery_type_id, v_inv.surgery_date, v_inv.discharge_date,
        v_inv.surgeon_name, v_inv.hospital_name, v_inv.clinical_notes, 'pemulihan_rumah'
      );
    END IF;
  END IF;

  -- Notify nurse
  INSERT INTO public.notifications (user_id, role, title, message, type, link_target)
  VALUES (
    v_inv.nurse_id,
    'nurse',
    'Pasien Mengaktifkan Akun',
    v_inv.patient_name || ' telah mengaktifkan akun NurseGo dan terhubung ke daftar pasien Anda.',
    'system',
    'patient:' || v_uid::text || ':overview'
  );

  RETURN jsonb_build_object('success', TRUE, 'nurse_id', v_inv.nurse_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.find_patient_for_nurse_link(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_caller_role TEXT;
  v_patient RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('found', FALSE, 'reason', 'Unauthorized');
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_uid;
  IF v_caller_role <> 'nurse' THEN
    RETURN jsonb_build_object('found', FALSE, 'reason', 'Hanya perawat yang dapat menautkan pasien.');
  END IF;

  SELECT id, full_name, email INTO v_patient
  FROM public.profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email))
    AND role = 'patient'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'found', TRUE,
    'patient_id', v_patient.id,
    'full_name', v_patient.full_name,
    'email', v_patient.email
  );
END;
$$;

-- 7. Enable Row Level Security (RLS) on All Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurse_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgery_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_nurse_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_sign_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pain_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wound_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursing_care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_adherence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_education_assignments ENABLE ROW LEVEL SECURITY;

-- 8. Strict RLS Policies
-- profiles
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_assigned_nurse(id)
    OR EXISTS (
      SELECT 1 FROM public.patient_nurse_assignments pna
      WHERE pna.patient_id = auth.uid() AND pna.nurse_id = profiles.id AND pna.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- nurse_profiles
DROP POLICY IF EXISTS "nurse_profiles_select" ON public.nurse_profiles;
CREATE POLICY "nurse_profiles_select" ON public.nurse_profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.patient_nurse_assignments pna
      WHERE pna.patient_id = auth.uid() AND pna.nurse_id = nurse_profiles.id AND pna.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "nurse_profiles_insert_own" ON public.nurse_profiles;
CREATE POLICY "nurse_profiles_insert_own" ON public.nurse_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "nurse_profiles_update_own" ON public.nurse_profiles;
CREATE POLICY "nurse_profiles_update_own" ON public.nurse_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- patient_profiles
DROP POLICY IF EXISTS "patient_profiles_select" ON public.patient_profiles;
CREATE POLICY "patient_profiles_select" ON public.patient_profiles FOR SELECT
  USING (auth.uid() = id OR public.is_assigned_nurse(id));

DROP POLICY IF EXISTS "patient_profiles_insert" ON public.patient_profiles;
CREATE POLICY "patient_profiles_insert" ON public.patient_profiles FOR INSERT
  WITH CHECK (auth.uid() = id OR public.is_assigned_nurse(id));

DROP POLICY IF EXISTS "patient_profiles_update" ON public.patient_profiles;
CREATE POLICY "patient_profiles_update" ON public.patient_profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_assigned_nurse(id))
  WITH CHECK (auth.uid() = id OR public.is_assigned_nurse(id));

-- surgery_types (public read)
DROP POLICY IF EXISTS "surgery_types_read_all" ON public.surgery_types;
CREATE POLICY "surgery_types_read_all" ON public.surgery_types FOR SELECT
  USING (TRUE);

-- patient_surgeries
DROP POLICY IF EXISTS "patient_surgeries_select" ON public.patient_surgeries;
CREATE POLICY "patient_surgeries_select" ON public.patient_surgeries FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "patient_surgeries_insert" ON public.patient_surgeries;
CREATE POLICY "patient_surgeries_insert" ON public.patient_surgeries FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "patient_surgeries_update" ON public.patient_surgeries;
CREATE POLICY "patient_surgeries_update" ON public.patient_surgeries FOR UPDATE
  USING (public.is_assigned_nurse(patient_id));

-- patient_nurse_assignments
DROP POLICY IF EXISTS "assignments_select" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_select" ON public.patient_nurse_assignments FOR SELECT
  USING (auth.uid() = patient_id OR auth.uid() = nurse_id);

DROP POLICY IF EXISTS "assignments_insert" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_insert" ON public.patient_nurse_assignments FOR INSERT
  WITH CHECK (
    (auth.uid() = nurse_id AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'nurse'))
    OR auth.uid() = patient_id
  );

DROP POLICY IF EXISTS "assignments_update" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_update" ON public.patient_nurse_assignments FOR UPDATE
  USING (auth.uid() = nurse_id);

-- patient_invitations
DROP POLICY IF EXISTS "invitations_nurse_all" ON public.patient_invitations;
CREATE POLICY "invitations_nurse_all" ON public.patient_invitations FOR ALL
  USING (auth.uid() = nurse_id)
  WITH CHECK (auth.uid() = nurse_id);

-- Clinical Records (vital_sign_records, pain_records, symptom_records, wound_records)
DROP POLICY IF EXISTS "vitals_select" ON public.vital_sign_records;
CREATE POLICY "vitals_select" ON public.vital_sign_records FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "vitals_insert" ON public.vital_sign_records;
CREATE POLICY "vitals_insert" ON public.vital_sign_records FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "pain_select" ON public.pain_records;
CREATE POLICY "pain_select" ON public.pain_records FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "pain_insert" ON public.pain_records;
CREATE POLICY "pain_insert" ON public.pain_records FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "symptoms_select" ON public.symptom_records;
CREATE POLICY "symptoms_select" ON public.symptom_records FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "symptoms_insert" ON public.symptom_records;
CREATE POLICY "symptoms_insert" ON public.symptom_records FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "wounds_select" ON public.wound_records;
CREATE POLICY "wounds_select" ON public.wound_records FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "wounds_insert" ON public.wound_records;
CREATE POLICY "wounds_insert" ON public.wound_records FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

-- patient_alerts & patient_alert_events
DROP POLICY IF EXISTS "alerts_select" ON public.patient_alerts;
CREATE POLICY "alerts_select" ON public.patient_alerts FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "alerts_insert" ON public.patient_alerts;
CREATE POLICY "alerts_insert" ON public.patient_alerts FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "alerts_update" ON public.patient_alerts;
CREATE POLICY "alerts_update" ON public.patient_alerts FOR UPDATE
  USING (public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "alert_events_all" ON public.patient_alert_events;
CREATE POLICY "alert_events_all" ON public.patient_alert_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_alerts pa
      WHERE pa.id = patient_alert_events.alert_id
        AND (pa.patient_id = auth.uid() OR public.is_assigned_nurse(pa.patient_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patient_alerts pa
      WHERE pa.id = patient_alert_events.alert_id
        AND (pa.patient_id = auth.uid() OR public.is_assigned_nurse(pa.patient_id))
    )
  );

-- nursing_care_plans
DROP POLICY IF EXISTS "care_plans_select" ON public.nursing_care_plans;
CREATE POLICY "care_plans_select" ON public.nursing_care_plans FOR SELECT
  USING (auth.uid() = patient_id OR auth.uid() = nurse_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "care_plans_nurse_write" ON public.nursing_care_plans;
CREATE POLICY "care_plans_nurse_write" ON public.nursing_care_plans FOR INSERT
  WITH CHECK (auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "care_plans_nurse_update" ON public.nursing_care_plans;
CREATE POLICY "care_plans_nurse_update" ON public.nursing_care_plans FOR UPDATE
  USING (auth.uid() = nurse_id OR public.is_assigned_nurse(patient_id));

-- patient_medications
DROP POLICY IF EXISTS "medications_select" ON public.patient_medications;
CREATE POLICY "medications_select" ON public.patient_medications FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "medications_nurse_write" ON public.patient_medications;
CREATE POLICY "medications_nurse_write" ON public.patient_medications FOR ALL
  USING (public.is_assigned_nurse(patient_id))
  WITH CHECK (public.is_assigned_nurse(patient_id));

-- medication_adherence_logs
DROP POLICY IF EXISTS "adherence_select" ON public.medication_adherence_logs;
CREATE POLICY "adherence_select" ON public.medication_adherence_logs FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "adherence_insert" ON public.medication_adherence_logs;
CREATE POLICY "adherence_insert" ON public.medication_adherence_logs FOR INSERT
  WITH CHECK (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));

-- patient_appointments
DROP POLICY IF EXISTS "appointments_select" ON public.patient_appointments;
CREATE POLICY "appointments_select" ON public.patient_appointments FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "appointments_nurse_write" ON public.patient_appointments;
CREATE POLICY "appointments_nurse_write" ON public.patient_appointments FOR ALL
  USING (public.is_assigned_nurse(patient_id))
  WITH CHECK (public.is_assigned_nurse(patient_id));

-- notifications (users can read/update own; assigned nurse/patient can insert notifications for counterpart)
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_insert_linked" ON public.notifications;
CREATE POLICY "notifications_insert_linked" ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_assigned_nurse(user_id)
    OR EXISTS (
      SELECT 1 FROM public.patient_nurse_assignments pna
      WHERE pna.patient_id = auth.uid() AND pna.nurse_id = notifications.user_id AND pna.is_active = TRUE
    )
  );

-- patient_messages
DROP POLICY IF EXISTS "messages_select" ON public.patient_messages;
CREATE POLICY "messages_select" ON public.patient_messages FOR SELECT
  USING (auth.uid() = patient_id OR auth.uid() = nurse_id);
DROP POLICY IF EXISTS "messages_insert" ON public.patient_messages;
CREATE POLICY "messages_insert" ON public.patient_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      (sender_role = 'patient' AND auth.uid() = patient_id AND EXISTS (
        SELECT 1 FROM public.patient_nurse_assignments pna
        WHERE pna.patient_id = auth.uid() AND pna.nurse_id = patient_messages.nurse_id AND pna.is_active = TRUE
      ))
      OR (sender_role = 'nurse' AND auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id))
    )
  );
DROP POLICY IF EXISTS "messages_update_read" ON public.patient_messages;
CREATE POLICY "messages_update_read" ON public.patient_messages FOR UPDATE
  USING (auth.uid() = patient_id OR auth.uid() = nurse_id);

-- patient_education_assignments
DROP POLICY IF EXISTS "education_select" ON public.patient_education_assignments;
CREATE POLICY "education_select" ON public.patient_education_assignments FOR SELECT
  USING (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "education_nurse_write" ON public.patient_education_assignments;
CREATE POLICY "education_nurse_write" ON public.patient_education_assignments FOR ALL
  USING (public.is_assigned_nurse(patient_id))
  WITH CHECK (auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id));
DROP POLICY IF EXISTS "education_patient_mark_read" ON public.patient_education_assignments;
CREATE POLICY "education_patient_mark_read" ON public.patient_education_assignments FOR UPDATE
  USING (auth.uid() = patient_id);

-- 9. Enable Supabase Realtime Publications (safe idempotent block)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'patient_nurse_assignments',
    'patient_invitations',
    'vital_sign_records',
    'pain_records',
    'symptom_records',
    'wound_records',
    'patient_alerts',
    'nursing_care_plans',
    'patient_medications',
    'medication_adherence_logs',
    'patient_appointments',
    'notifications',
    'patient_messages',
    'patient_education_assignments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      -- Table already in publication, ignore
      NULL;
    END;
  END LOOP;
END $$;
