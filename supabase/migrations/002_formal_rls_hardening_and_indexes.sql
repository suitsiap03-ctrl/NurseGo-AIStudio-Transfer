-- ============================================================================
-- NurseGo Formal Schema Hardening, Cross-Patient RLS Isolation & Indexes
-- Migration: 002_formal_rls_hardening_and_indexes.sql
-- Target: Supabase PostgreSQL (Project: pwokxvmvyezhacjpzhuz)
-- Prerequisite: 001_nursego_complete_upgrade.sql
-- Safe & idempotent to run repeatedly in Supabase SQL Editor or via `supabase db push`.
-- ============================================================================

-- 1. Referential & Structural Integrity Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_invitations_surgery_type_id_fkey'
      AND conrelid = 'public.patient_invitations'::regclass
  ) THEN
    ALTER TABLE public.patient_invitations
      ADD CONSTRAINT patient_invitations_surgery_type_id_fkey
      FOREIGN KEY (surgery_type_id) REFERENCES public.surgery_types(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_invitations_accepted_by_fkey'
      AND conrelid = 'public.patient_invitations'::regclass
  ) THEN
    ALTER TABLE public.patient_invitations
      ADD CONSTRAINT patient_invitations_accepted_by_fkey
      FOREIGN KEY (accepted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_nurse_assignments_distinct_users_check'
      AND conrelid = 'public.patient_nurse_assignments'::regclass
  ) THEN
    ALTER TABLE public.patient_nurse_assignments
      ADD CONSTRAINT patient_nurse_assignments_distinct_users_check
      CHECK (patient_id <> nurse_id);
  END IF;
END $$;

-- 2. Automatic `updated_at` Timestamp Maintenance
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_nurse_profiles_updated_at ON public.nurse_profiles;
CREATE TRIGGER trg_nurse_profiles_updated_at
  BEFORE UPDATE ON public.nurse_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_patient_profiles_updated_at ON public.patient_profiles;
CREATE TRIGGER trg_patient_profiles_updated_at
  BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_nursing_care_plans_updated_at ON public.nursing_care_plans;
CREATE TRIGGER trg_nursing_care_plans_updated_at
  BEFORE UPDATE ON public.nursing_care_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Security-Definer Role, Email & Assignment Helpers (Non-Recursive)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT LOWER(TRIM(p.email)) FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1),
    (SELECT LOWER(TRIM(u.email)) FROM auth.users u WHERE u.id = auth.uid() LIMIT 1)
  );
$$;

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
    JOIN public.profiles prof ON prof.id = pna.nurse_id
    WHERE pna.patient_id = target_patient_id
      AND pna.nurse_id = auth.uid()
      AND pna.is_active = TRUE
      AND prof.role = 'nurse'
  );
$$;

-- Harden `complete_patient_activation`: enforce expiration, role check, and email ownership
CREATE OR REPLACE FUNCTION public.complete_patient_activation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user_email TEXT;
  v_user_role TEXT;
  v_inv RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Sesi autentikasi belum aktif.');
  END IF;

  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_uid;
  IF v_user_role = 'nurse' THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Akun perawat tidak dapat diaktifkan sebagai pasien.');
  END IF;

  SELECT LOWER(TRIM(COALESCE(p.email, u.email))) INTO v_user_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid
  LIMIT 1;

  SELECT * INTO v_inv
  FROM public.patient_invitations
  WHERE UPPER(TRIM(token)) = UPPER(TRIM(p_token))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Undangan tidak ditemukan.');
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() AND v_inv.status <> 'accepted' THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Token undangan sudah kedaluwarsa. Hubungi perawat Anda.');
  END IF;

  IF v_inv.status = 'accepted' AND v_inv.accepted_by IS NOT NULL AND v_inv.accepted_by <> v_uid THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Undangan sudah diaktifkan oleh akun lain.');
  END IF;

  IF v_user_email IS NULL OR LOWER(TRIM(v_inv.patient_email)) <> v_user_email THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Email akun yang login tidak sesuai dengan email undangan pasien.');
  END IF;

  UPDATE public.patient_invitations
  SET status = 'accepted',
      accepted_by = v_uid,
      accepted_at = COALESCE(accepted_at, NOW())
  WHERE id = v_inv.id;

  INSERT INTO public.patient_profiles (id, date_of_birth, gender)
  VALUES (v_uid, v_inv.date_of_birth, v_inv.gender)
  ON CONFLICT (id) DO UPDATE SET
    date_of_birth = COALESCE(public.patient_profiles.date_of_birth, EXCLUDED.date_of_birth),
    gender = COALESCE(public.patient_profiles.gender, EXCLUDED.gender),
    updated_at = NOW();

  INSERT INTO public.patient_nurse_assignments (patient_id, nurse_id, is_active)
  VALUES (v_uid, v_inv.nurse_id, TRUE)
  ON CONFLICT (patient_id, nurse_id) DO UPDATE SET is_active = TRUE;

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

-- 4. Column-Immutability Guards for Shared/Read-Ack Tables
CREATE OR REPLACE FUNCTION public.protect_patient_education_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Patients may only mark their assigned education note as read
  IF auth.uid() = OLD.patient_id AND NOT public.is_assigned_nurse(OLD.patient_id) THEN
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.nurse_id IS DISTINCT FROM OLD.nurse_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Pasien hanya diperbolehkan memperbarui status baca edukasi.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_education_update ON public.patient_education_assignments;
CREATE TRIGGER trg_protect_education_update
  BEFORE UPDATE ON public.patient_education_assignments
  FOR EACH ROW EXECUTE FUNCTION public.protect_patient_education_update();

CREATE OR REPLACE FUNCTION public.protect_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.link_target IS DISTINCT FROM OLD.link_target
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Notifikasi tidak dapat diubah kontennya setelah dibuat.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_notification_update ON public.notifications;
CREATE TRIGGER trg_protect_notification_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_notification_update();

CREATE OR REPLACE FUNCTION public.protect_patient_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.nurse_id IS DISTINCT FROM OLD.nurse_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_role IS DISTINCT FROM OLD.sender_role
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Isi pesan tidak dapat diubah setelah dikirim.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_message_update ON public.patient_messages;
CREATE TRIGGER trg_protect_message_update
  BEFORE UPDATE ON public.patient_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_patient_message_update();

-- 5. Confirm RLS Enabled on Every Table
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

-- 6. Hardened RLS Policies (Zero Cross-Patient / Cross-Nurse Leakage)
-- profiles
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND role IN ('nurse', 'patient'));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = public.current_user_role());

-- nurse_profiles
DROP POLICY IF EXISTS "nurse_profiles_insert_own" ON public.nurse_profiles;
CREATE POLICY "nurse_profiles_insert_own" ON public.nurse_profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND public.current_user_role() = 'nurse');

DROP POLICY IF EXISTS "nurse_profiles_update_own" ON public.nurse_profiles;
CREATE POLICY "nurse_profiles_update_own" ON public.nurse_profiles FOR UPDATE
  USING (auth.uid() = id AND public.current_user_role() = 'nurse')
  WITH CHECK (auth.uid() = id AND public.current_user_role() = 'nurse');

-- patient_profiles
DROP POLICY IF EXISTS "patient_profiles_insert" ON public.patient_profiles;
CREATE POLICY "patient_profiles_insert" ON public.patient_profiles FOR INSERT
  WITH CHECK (
    (auth.uid() = id AND public.current_user_role() = 'patient')
    OR public.is_assigned_nurse(id)
  );

DROP POLICY IF EXISTS "patient_profiles_update" ON public.patient_profiles;
CREATE POLICY "patient_profiles_update" ON public.patient_profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_assigned_nurse(id))
  WITH CHECK (auth.uid() = id OR public.is_assigned_nurse(id));

-- patient_surgeries
DROP POLICY IF EXISTS "patient_surgeries_update" ON public.patient_surgeries;
CREATE POLICY "patient_surgeries_update" ON public.patient_surgeries FOR UPDATE
  USING (public.is_assigned_nurse(patient_id))
  WITH CHECK (public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "patient_surgeries_delete" ON public.patient_surgeries;
CREATE POLICY "patient_surgeries_delete" ON public.patient_surgeries FOR DELETE
  USING (public.is_assigned_nurse(patient_id));

-- patient_nurse_assignments: prevent arbitrary self-attachment without a valid nurse link or invitation
DROP POLICY IF EXISTS "assignments_insert" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_insert" ON public.patient_nurse_assignments FOR INSERT
  WITH CHECK (
    (
      auth.uid() = nurse_id
      AND public.current_user_role() = 'nurse'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = patient_nurse_assignments.patient_id AND p.role = 'patient'
      )
    )
    OR (
      auth.uid() = patient_id
      AND public.current_user_role() = 'patient'
      AND EXISTS (
        SELECT 1 FROM public.patient_invitations pi
        WHERE pi.nurse_id = patient_nurse_assignments.nurse_id
          AND LOWER(TRIM(pi.patient_email)) = public.current_user_email()
          AND pi.status IN ('pending', 'sent', 'delivered', 'accepted')
          AND (pi.accepted_by IS NULL OR pi.accepted_by = auth.uid())
          AND (pi.expires_at IS NULL OR pi.expires_at >= NOW() OR pi.status = 'accepted')
      )
    )
  );

DROP POLICY IF EXISTS "assignments_update" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_update" ON public.patient_nurse_assignments FOR UPDATE
  USING (auth.uid() = nurse_id AND public.current_user_role() = 'nurse')
  WITH CHECK (auth.uid() = nurse_id AND public.current_user_role() = 'nurse');

DROP POLICY IF EXISTS "assignments_delete" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_delete" ON public.patient_nurse_assignments FOR DELETE
  USING (auth.uid() = nurse_id AND public.current_user_role() = 'nurse');

-- patient_invitations
DROP POLICY IF EXISTS "invitations_nurse_all" ON public.patient_invitations;
CREATE POLICY "invitations_nurse_all" ON public.patient_invitations FOR ALL
  USING (auth.uid() = nurse_id AND public.current_user_role() = 'nurse')
  WITH CHECK (auth.uid() = nurse_id AND public.current_user_role() = 'nurse');

-- Clinical Monitoring Tables (enforce patient/assigned nurse + recorder identity)
DROP POLICY IF EXISTS "vitals_insert" ON public.vital_sign_records;
CREATE POLICY "vitals_insert" ON public.vital_sign_records FOR INSERT
  WITH CHECK (
    (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id))
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

DROP POLICY IF EXISTS "pain_insert" ON public.pain_records;
CREATE POLICY "pain_insert" ON public.pain_records FOR INSERT
  WITH CHECK (
    (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id))
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

DROP POLICY IF EXISTS "symptoms_insert" ON public.symptom_records;
CREATE POLICY "symptoms_insert" ON public.symptom_records FOR INSERT
  WITH CHECK (
    (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id))
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

DROP POLICY IF EXISTS "wounds_insert" ON public.wound_records;
CREATE POLICY "wounds_insert" ON public.wound_records FOR INSERT
  WITH CHECK (
    (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id))
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

-- patient_alerts & patient_alert_events
DROP POLICY IF EXISTS "alerts_update" ON public.patient_alerts;
CREATE POLICY "alerts_update" ON public.patient_alerts FOR UPDATE
  USING (public.is_assigned_nurse(patient_id))
  WITH CHECK (public.is_assigned_nurse(patient_id));

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
    (created_by IS NULL OR created_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.patient_alerts pa
      WHERE pa.id = patient_alert_events.alert_id
        AND (pa.patient_id = auth.uid() OR public.is_assigned_nurse(pa.patient_id))
    )
  );

-- nursing_care_plans
DROP POLICY IF EXISTS "care_plans_nurse_update" ON public.nursing_care_plans;
CREATE POLICY "care_plans_nurse_update" ON public.nursing_care_plans FOR UPDATE
  USING (auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id))
  WITH CHECK (auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id));

DROP POLICY IF EXISTS "care_plans_nurse_delete" ON public.nursing_care_plans;
CREATE POLICY "care_plans_nurse_delete" ON public.nursing_care_plans FOR DELETE
  USING (auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id));

-- medication_adherence_logs: validate medication belongs to the same patient
DROP POLICY IF EXISTS "adherence_insert" ON public.medication_adherence_logs;
CREATE POLICY "adherence_insert" ON public.medication_adherence_logs FOR INSERT
  WITH CHECK (
    (auth.uid() = patient_id OR public.is_assigned_nurse(patient_id))
    AND EXISTS (
      SELECT 1 FROM public.patient_medications pm
      WHERE pm.id = medication_adherence_logs.medication_id
        AND pm.patient_id = medication_adherence_logs.patient_id
    )
  );

-- notifications
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- patient_messages
DROP POLICY IF EXISTS "messages_update_read" ON public.patient_messages;
CREATE POLICY "messages_update_read" ON public.patient_messages FOR UPDATE
  USING (auth.uid() = patient_id OR auth.uid() = nurse_id)
  WITH CHECK (auth.uid() = patient_id OR auth.uid() = nurse_id);

-- patient_education_assignments
DROP POLICY IF EXISTS "education_patient_mark_read" ON public.patient_education_assignments;
CREATE POLICY "education_patient_mark_read" ON public.patient_education_assignments FOR UPDATE
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

-- 7. Explicit Privilege Grants (Least Privilege for `anon` vs `authenticated`)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.surgery_types TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.nurse_profiles,
  public.patient_profiles,
  public.patient_surgeries,
  public.patient_nurse_assignments,
  public.patient_invitations,
  public.vital_sign_records,
  public.pain_records,
  public.symptom_records,
  public.wound_records,
  public.patient_alerts,
  public.patient_alert_events,
  public.nursing_care_plans,
  public.patient_medications,
  public.medication_adherence_logs,
  public.patient_appointments,
  public.notifications,
  public.patient_messages,
  public.patient_education_assignments
TO authenticated;

REVOKE ALL ON FUNCTION public.verify_patient_invitation(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_patient_invitation(TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_patient_activation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_patient_activation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.find_patient_for_nurse_link(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_patient_for_nurse_link(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.is_assigned_nurse(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assigned_nurse(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;

-- 8. Performance Indexes for RLS Evaluation, Dashboards & Realtime Queries
CREATE INDEX IF NOT EXISTS idx_pna_nurse_active
  ON public.patient_nurse_assignments (nurse_id, is_active, patient_id);

CREATE INDEX IF NOT EXISTS idx_pna_patient_active
  ON public.patient_nurse_assignments (patient_id, is_active, nurse_id);

CREATE INDEX IF NOT EXISTS idx_invitations_nurse_created
  ON public.patient_invitations (nurse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invitations_email_lower
  ON public.patient_invitations (LOWER(TRIM(patient_email)));

CREATE INDEX IF NOT EXISTS idx_surgeries_patient_date
  ON public.patient_surgeries (patient_id, surgery_date DESC);

CREATE INDEX IF NOT EXISTS idx_vitals_patient_recorded
  ON public.vital_sign_records (patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_pain_patient_recorded
  ON public.pain_records (patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_symptoms_patient_recorded
  ON public.symptom_records (patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_wounds_patient_recorded
  ON public.wound_records (patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_patient_status_created
  ON public.patient_alerts (patient_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_alert_created
  ON public.patient_alert_events (alert_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_care_plans_patient_created
  ON public.nursing_care_plans (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_care_plans_nurse_created
  ON public.nursing_care_plans (nurse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_medications_patient_active
  ON public.patient_medications (patient_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adherence_patient_med_time
  ON public.medication_adherence_logs (patient_id, medication_id, scheduled_time DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_date
  ON public.patient_appointments (patient_id, appointment_date ASC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_pair_created
  ON public.patient_messages (patient_id, nurse_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_education_patient_created
  ON public.patient_education_assignments (patient_id, created_at DESC);

-- 9. Supabase Storage Bucket & Policies for Nurse Credentials (`nurse-documents`)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nurse-documents',
  'nurse-documents',
  FALSE,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "nurse_docs_select_own" ON storage.objects;
CREATE POLICY "nurse_docs_select_own" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nurse-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "nurse_docs_insert_own" ON storage.objects;
CREATE POLICY "nurse_docs_insert_own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nurse-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_user_role() = 'nurse'
  );

DROP POLICY IF EXISTS "nurse_docs_update_own" ON storage.objects;
CREATE POLICY "nurse_docs_update_own" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nurse-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_user_role() = 'nurse'
  )
  WITH CHECK (
    bucket_id = 'nurse-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_user_role() = 'nurse'
  );

DROP POLICY IF EXISTS "nurse_docs_delete_own" ON storage.objects;
CREATE POLICY "nurse_docs_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nurse-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_user_role() = 'nurse'
  );
