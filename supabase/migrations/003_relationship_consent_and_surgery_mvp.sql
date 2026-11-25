-- ============================================================================
-- NurseGo Multi-Nurse Consent Relationships & 7 MVP Surgery Standardization
-- Migration: 003_relationship_consent_and_surgery_mvp.sql
-- Target: Supabase PostgreSQL (Project: pwokxvmvyezhacjpzhuz)
-- Prerequisites: 001_nursego_complete_upgrade.sql, 002_formal_rls_hardening_and_indexes.sql
-- Safe & idempotent to run repeatedly in Supabase SQL Editor.
-- ============================================================================

-- 1. Standardize Surgery Types strictly to the 7 MVP Postoperative Templates
ALTER TABLE public.surgery_types
  ADD COLUMN IF NOT EXISTS is_mvp BOOLEAN NOT NULL DEFAULT TRUE;

-- Rename legacy names cleanly to canonical 7 MVP names when safe (preserves patient_surgeries FKs)
DO $$
DECLARE
  v_map RECORD;
BEGIN
  FOR v_map IN
    SELECT * FROM (VALUES
      ('Apendektomi (Usus Buntu)', 'Apendektomi'),
      ('Sectio Caesarea (Operasi Caesar)', 'Sectio Caesarea (SC)'),
      ('Herniorafi (Operasi Hernia)', 'Herniorafi'),
      ('Kolesistektomi (Empedu)', 'Kolesistektomi'),
      ('Bedah Payudara / Mastektomi', 'Mastektomi')
    ) AS t(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM public.surgery_types WHERE name = v_map.old_name)
       AND NOT EXISTS (SELECT 1 FROM public.surgery_types WHERE name = v_map.new_name) THEN
      UPDATE public.surgery_types
      SET name = v_map.new_name, is_mvp = TRUE
      WHERE name = v_map.old_name;
    END IF;
  END LOOP;
END $$;

-- Mark any legacy non-MVP entries inactive for new MVP dropdowns without deleting historic rows
UPDATE public.surgery_types
SET is_mvp = FALSE
WHERE name NOT IN (
  'Apendektomi',
  'Sectio Caesarea (SC)',
  'Herniorafi',
  'Total Knee Replacement (TKR)',
  'ORIF',
  'Kolesistektomi',
  'Mastektomi'
);

-- Upsert exact 7 MVP surgery types
INSERT INTO public.surgery_types (name, code, category, estimated_recovery_days, description, is_mvp)
VALUES
  ('Apendektomi', 'APP-01', 'Bedah Digestif', 14, 'Operasi pengangkatan usus buntu (laparoskopi atau terbuka)', TRUE),
  ('Sectio Caesarea (SC)', 'OBS-01', 'Obstetri & Ginekologi', 28, 'Persalinan melalui tindakan operasi pada dinding perut dan rahim', TRUE),
  ('Herniorafi', 'DIG-03', 'Bedah Umum', 21, 'Perbaikan jaringan otot dinding perut akibat hernia', TRUE),
  ('Total Knee Replacement (TKR)', 'ORT-TKR', 'Bedah Ortopedi', 42, 'Operasi penggantian sendi lutut dengan prostesis', TRUE),
  ('ORIF', 'ORT-ORIF', 'Bedah Ortopedi', 42, 'Open Reduction Internal Fixation untuk fiksasi patah tulang', TRUE),
  ('Kolesistektomi', 'DIG-02', 'Bedah Digestif', 14, 'Operasi pengangkatan kantong empedu', TRUE),
  ('Mastektomi', 'ONK-01', 'Bedah Onkologi', 28, 'Tindakan pembedahan pada jaringan payudara', TRUE)
ON CONFLICT (name) DO UPDATE SET
  code = EXCLUDED.code,
  category = EXCLUDED.category,
  estimated_recovery_days = EXCLUDED.estimated_recovery_days,
  description = EXCLUDED.description,
  is_mvp = TRUE;

-- 2. Upgrade `patient_nurse_assignments` for Multi-Nurse Care & Mutual Consent Workflow
ALTER TABLE public.patient_nurse_assignments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.patient_nurse_assignments
  ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.patient_nurse_assignments
  ADD COLUMN IF NOT EXISTS relationship_role TEXT NOT NULL DEFAULT 'perawat_pendamping';

ALTER TABLE public.patient_nurse_assignments
  ADD COLUMN IF NOT EXISTS consent_responded_at TIMESTAMPTZ;

ALTER TABLE public.patient_nurse_assignments
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ensure constraint on status exists safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_nurse_assignments_status_check'
      AND conrelid = 'public.patient_nurse_assignments'::regclass
  ) THEN
    ALTER TABLE public.patient_nurse_assignments
      ADD CONSTRAINT patient_nurse_assignments_status_check
      CHECK (status IN ('active', 'pending_nurse', 'pending_patient', 'rejected', 'ended'));
  END IF;
END $$;

-- Sync historic rows where is_active = FALSE
UPDATE public.patient_nurse_assignments
SET status = 'ended'
WHERE is_active = FALSE AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_pna_patient_status_active
  ON public.patient_nurse_assignments (patient_id, status, is_active);

CREATE INDEX IF NOT EXISTS idx_pna_nurse_status_active
  ON public.patient_nurse_assignments (nurse_id, status, is_active);

-- 3. Harden `is_assigned_nurse` & RLS Policies to Require Active Consent (`status = 'active'`)
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
      AND pna.status = 'active'
      AND prof.role = 'nurse'
  );
$$;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_assigned_nurse(id)
    OR EXISTS (
      SELECT 1 FROM public.patient_nurse_assignments pna
      WHERE pna.patient_id = auth.uid()
        AND pna.nurse_id = profiles.id
        AND pna.is_active = TRUE
        AND pna.status = 'active'
    )
  );

DROP POLICY IF EXISTS "nurse_profiles_select" ON public.nurse_profiles;
CREATE POLICY "nurse_profiles_select" ON public.nurse_profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.patient_nurse_assignments pna
      WHERE pna.patient_id = auth.uid()
        AND pna.nurse_id = nurse_profiles.id
        AND pna.is_active = TRUE
        AND pna.status = 'active'
    )
  );

DROP POLICY IF EXISTS "notifications_insert_linked" ON public.notifications;
CREATE POLICY "notifications_insert_linked" ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_assigned_nurse(user_id)
    OR EXISTS (
      SELECT 1 FROM public.patient_nurse_assignments pna
      WHERE pna.patient_id = auth.uid()
        AND pna.nurse_id = notifications.user_id
        AND pna.is_active = TRUE
        AND pna.status = 'active'
    )
  );

DROP POLICY IF EXISTS "messages_insert" ON public.patient_messages;
CREATE POLICY "messages_insert" ON public.patient_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      (sender_role = 'patient' AND auth.uid() = patient_id AND EXISTS (
        SELECT 1 FROM public.patient_nurse_assignments pna
        WHERE pna.patient_id = auth.uid()
          AND pna.nurse_id = patient_messages.nurse_id
          AND pna.is_active = TRUE
          AND pna.status = 'active'
      ))
      OR (sender_role = 'nurse' AND auth.uid() = nurse_id AND public.is_assigned_nurse(patient_id))
    )
  );

-- Prevent direct table updates from activating unapproved links without consent
DROP POLICY IF EXISTS "assignments_update" ON public.patient_nurse_assignments;
CREATE POLICY "assignments_update" ON public.patient_nurse_assignments FOR UPDATE
  USING (auth.uid() = nurse_id OR auth.uid() = patient_id)
  WITH CHECK (
    (auth.uid() = nurse_id OR auth.uid() = patient_id)
    AND is_active = FALSE
    AND status IN ('ended', 'rejected')
  );

-- 4. Update `complete_patient_activation` to populate consent metadata
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

  INSERT INTO public.patient_nurse_assignments (
    patient_id, nurse_id, is_active, status, initiated_by, relationship_role, consent_responded_at
  )
  VALUES (
    v_uid, v_inv.nurse_id, TRUE, 'active', v_inv.nurse_id, 'perawat_penanggung_jawab', NOW()
  )
  ON CONFLICT (patient_id, nurse_id) DO UPDATE SET
    is_active = TRUE,
    status = 'active',
    consent_responded_at = NOW();

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

-- 5. SECURITY DEFINER RPCs for Multi-Nurse Consent & Privacy-Preserving Relationships

-- 5A. Get caller's own active, pending, and ended nurse-patient relationships (zero directory exposure)
CREATE OR REPLACE FUNCTION public.get_my_nurse_patient_relationships()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_obj ORDER BY assigned_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'id', pna.id,
        'patient_id', pna.patient_id,
        'nurse_id', pna.nurse_id,
        'is_active', pna.is_active,
        'status', pna.status,
        'initiated_by', pna.initiated_by,
        'relationship_role', pna.relationship_role,
        'notes', pna.notes,
        'assigned_at', pna.assigned_at,
        'consent_responded_at', pna.consent_responded_at,
        'counterpart_id', CASE WHEN pna.patient_id = v_uid THEN np.id ELSE pp.id END,
        'counterpart_role', CASE WHEN pna.patient_id = v_uid THEN 'nurse' ELSE 'patient' END,
        'counterpart_name', CASE WHEN pna.patient_id = v_uid THEN np.full_name ELSE pp.full_name END,
        'counterpart_email', CASE WHEN pna.patient_id = v_uid THEN np.email ELSE pp.email END,
        'counterpart_phone', CASE WHEN pna.patient_id = v_uid THEN np.phone ELSE pp.phone END,
        'professional_title', nprof.professional_title,
        'hospital_name', nprof.hospital_name,
        'department', nprof.department,
        'verification_status', nprof.verification_status,
        'education_level', nprof.education_level,
        'has_ners_profession', nprof.has_ners_profession,
        'academic_degree', nprof.academic_degree
      ) AS row_obj,
      pna.assigned_at
    FROM public.patient_nurse_assignments pna
    JOIN public.profiles np ON np.id = pna.nurse_id
    JOIN public.profiles pp ON pp.id = pna.patient_id
    LEFT JOIN public.nurse_profiles nprof ON nprof.id = pna.nurse_id
    WHERE pna.patient_id = v_uid OR pna.nurse_id = v_uid
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 5B. Patient invites an additional nurse by exact registered email (no nurse directory exposed)
CREATE OR REPLACE FUNCTION public.patient_invite_additional_nurse(
  p_nurse_email TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_caller_role TEXT;
  v_patient_name TEXT;
  v_nurse RECORD;
  v_existing RECORD;
  v_assign_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Sesi autentikasi belum aktif.');
  END IF;

  SELECT role, full_name INTO v_caller_role, v_patient_name
  FROM public.profiles WHERE id = v_uid;

  IF v_caller_role <> 'patient' THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Hanya pasien yang dapat mengundang perawat pendamping.');
  END IF;

  IF p_nurse_email IS NULL OR LENGTH(TRIM(p_nurse_email)) = 0 THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Masukkan alamat email perawat yang valid.');
  END IF;

  SELECT id, full_name, email INTO v_nurse
  FROM public.profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_nurse_email))
    AND role = 'nurse'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'reason', 'Perawat dengan alamat email tersebut tidak ditemukan atau belum terdaftar di NurseGo.'
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.patient_nurse_assignments
  WHERE patient_id = v_uid AND nurse_id = v_nurse.id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.is_active AND v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', FALSE, 'reason', 'Perawat tersebut sudah terhubung aktif dengan Anda.');
    ELSIF v_existing.status IN ('pending_nurse', 'pending_patient') THEN
      RETURN jsonb_build_object('success', FALSE, 'reason', 'Permintaan hubungan dengan perawat tersebut masih menunggu persetujuan.');
    END IF;

    UPDATE public.patient_nurse_assignments
    SET is_active = FALSE,
        status = 'pending_nurse',
        initiated_by = v_uid,
        relationship_role = 'perawat_pendamping',
        notes = NULLIF(TRIM(p_notes), ''),
        consent_responded_at = NULL,
        assigned_at = NOW()
    WHERE id = v_existing.id
    RETURNING id INTO v_assign_id;
  ELSE
    INSERT INTO public.patient_nurse_assignments (
      patient_id, nurse_id, is_active, status, initiated_by, relationship_role, notes
    ) VALUES (
      v_uid, v_nurse.id, FALSE, 'pending_nurse', v_uid, 'perawat_pendamping', NULLIF(TRIM(p_notes), '')
    )
    RETURNING id INTO v_assign_id;
  END IF;

  INSERT INTO public.notifications (user_id, role, title, message, type, link_target)
  VALUES (
    v_nurse.id,
    'nurse',
    'Undangan Pendampingan Pasien',
    COALESCE(v_patient_name, 'Pasien') || ' mengundang Anda sebagai perawat pendamping. Buka Daftar Pasien untuk menyetujui atau menolak.',
    'system',
    'patients:pending'
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'assignment_id', v_assign_id,
    'nurse_name', v_nurse.full_name
  );
END;
$$;

-- 5C. Nurse requests connection with an existing registered patient (requires patient consent)
CREATE OR REPLACE FUNCTION public.nurse_request_patient_link(
  p_patient_email TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_caller_role TEXT;
  v_nurse_name TEXT;
  v_patient RECORD;
  v_existing RECORD;
  v_assign_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Sesi autentikasi belum aktif.');
  END IF;

  SELECT role, full_name INTO v_caller_role, v_nurse_name
  FROM public.profiles WHERE id = v_uid;

  IF v_caller_role <> 'nurse' THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Hanya perawat yang dapat mengajukan penautan pasien.');
  END IF;

  SELECT id, full_name, email INTO v_patient
  FROM public.profiles
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_patient_email))
    AND role = 'patient'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Pasien dengan email tersebut tidak ditemukan.');
  END IF;

  SELECT * INTO v_existing
  FROM public.patient_nurse_assignments
  WHERE patient_id = v_patient.id AND nurse_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.is_active AND v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', FALSE, 'reason', 'Pasien ini sudah aktif dalam daftar pasien Anda.');
    ELSIF v_existing.status = 'pending_patient' THEN
      RETURN jsonb_build_object('success', FALSE, 'reason', 'Permintaan penautan sudah dikirim dan sedang menunggu persetujuan pasien.');
    END IF;

    UPDATE public.patient_nurse_assignments
    SET is_active = FALSE,
        status = 'pending_patient',
        initiated_by = v_uid,
        relationship_role = 'perawat_pendamping',
        notes = NULLIF(TRIM(p_notes), ''),
        consent_responded_at = NULL,
        assigned_at = NOW()
    WHERE id = v_existing.id
    RETURNING id INTO v_assign_id;
  ELSE
    INSERT INTO public.patient_nurse_assignments (
      patient_id, nurse_id, is_active, status, initiated_by, relationship_role, notes
    ) VALUES (
      v_patient.id, v_uid, FALSE, 'pending_patient', v_uid, 'perawat_pendamping', NULLIF(TRIM(p_notes), '')
    )
    RETURNING id INTO v_assign_id;
  END IF;

  INSERT INTO public.notifications (user_id, role, title, message, type, link_target)
  VALUES (
    v_patient.id,
    'patient',
    'Permintaan Penautan Perawat',
    COALESCE(v_nurse_name, 'Perawat') || ' mengajukan permintaan untuk memantau pemulihan Anda. Buka menu Profil untuk menyetujui atau menolak.',
    'system',
    'tab:profil'
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'assignment_id', v_assign_id,
    'patient_id', v_patient.id,
    'patient_name', v_patient.full_name,
    'status', 'pending_patient'
  );
END;
$$;

-- 5D. Approve or reject a pending nurse-patient relationship (only target recipient can respond)
CREATE OR REPLACE FUNCTION public.respond_nurse_patient_assignment(
  p_assignment_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assign RECORD;
  v_responder_name TEXT;
  v_target_user UUID;
  v_target_role TEXT;
  v_new_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Sesi autentikasi belum aktif.');
  END IF;

  SELECT * INTO v_assign
  FROM public.patient_nurse_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Data hubungan perawat-pasien tidak ditemukan.');
  END IF;

  IF v_assign.status = 'pending_nurse' THEN
    IF v_assign.nurse_id <> v_uid THEN
      RETURN jsonb_build_object('success', FALSE, 'reason', 'Hanya perawat yang diundang yang dapat merespons permintaan ini.');
    END IF;
    v_target_user := v_assign.patient_id;
    v_target_role := 'patient';
  ELSIF v_assign.status = 'pending_patient' THEN
    IF v_assign.patient_id <> v_uid THEN
      RETURN jsonb_build_object('success', FALSE, 'reason', 'Hanya pasien terkait yang dapat merespons permintaan ini.');
    END IF;
    v_target_user := v_assign.nurse_id;
    v_target_role := 'nurse';
  ELSE
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Permintaan hubungan ini sudah diproses sebelumnya.');
  END IF;

  v_new_status := CASE WHEN p_accept THEN 'active' ELSE 'rejected' END;

  UPDATE public.patient_nurse_assignments
  SET is_active = p_accept,
      status = v_new_status,
      consent_responded_at = NOW()
  WHERE id = v_assign.id;

  SELECT full_name INTO v_responder_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, role, title, message, type, link_target)
  VALUES (
    v_target_user,
    v_target_role,
    CASE WHEN p_accept THEN 'Hubungan Perawatan Disetujui' ELSE 'Permintaan Hubungan Ditolak' END,
    COALESCE(v_responder_name, 'Pengguna') ||
      CASE WHEN p_accept
        THEN ' telah menyetujui hubungan pemantauan keperawatan.'
        ELSE ' menolak permintaan hubungan pemantauan.'
      END,
    'system',
    CASE WHEN v_target_role = 'patient' THEN 'tab:profil' ELSE 'patient:' || v_assign.patient_id::text || ':overview' END
  );

  RETURN jsonb_build_object('success', TRUE, 'status', v_new_status);
END;
$$;

-- 5E. Terminate an active or pending relationship by either the patient or nurse
CREATE OR REPLACE FUNCTION public.end_nurse_patient_assignment(
  p_assignment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assign RECORD;
  v_actor_name TEXT;
  v_other_user UUID;
  v_other_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Sesi autentikasi belum aktif.');
  END IF;

  SELECT * INTO v_assign
  FROM public.patient_nurse_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Hubungan perawatan tidak ditemukan.');
  END IF;

  IF v_uid <> v_assign.patient_id AND v_uid <> v_assign.nurse_id THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'Anda tidak memiliki izin mengakhiri hubungan ini.');
  END IF;

  UPDATE public.patient_nurse_assignments
  SET is_active = FALSE,
      status = 'ended',
      consent_responded_at = NOW()
  WHERE id = v_assign.id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  IF v_uid = v_assign.patient_id THEN
    v_other_user := v_assign.nurse_id;
    v_other_role := 'nurse';
  ELSE
    v_other_user := v_assign.patient_id;
    v_other_role := 'patient';
  END IF;

  INSERT INTO public.notifications (user_id, role, title, message, type, link_target)
  VALUES (
    v_other_user,
    v_other_role,
    'Hubungan Pemantauan Diakhiri',
    COALESCE(v_actor_name, 'Pengguna') || ' telah mengakhiri hubungan pemantauan perawatan di NurseGo.',
    'system',
    CASE WHEN v_other_role = 'patient' THEN 'tab:profil' ELSE 'patients' END
  );

  RETURN jsonb_build_object('success', TRUE, 'status', 'ended');
END;
$$;

-- 6. Explicit Function Execution Grants
REVOKE ALL ON FUNCTION public.get_my_nurse_patient_relationships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_nurse_patient_relationships() TO authenticated;

REVOKE ALL ON FUNCTION public.patient_invite_additional_nurse(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_invite_additional_nurse(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.nurse_request_patient_link(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nurse_request_patient_link(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.respond_nurse_patient_assignment(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_nurse_patient_assignment(UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.end_nurse_patient_assignment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_nurse_patient_assignment(UUID) TO authenticated;
