-- ============================================================================
-- NurseGo Database Schema & Cross-Patient RLS Verification Script
-- Run in Supabase SQL Editor AFTER running:
--   supabase/migrations/004_live_sync_consent_rpcs_and_mvp.sql
-- All simulated isolation tests run inside a rolled-back transaction (zero residue).
-- ============================================================================

-- 1. Verify RLS is enabled on all 20 NurseGo public tables
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'FAIL: RLS DISABLED' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'profiles',
    'nurse_profiles',
    'patient_profiles',
    'surgery_types',
    'patient_surgeries',
    'patient_nurse_assignments',
    'patient_invitations',
    'vital_sign_records',
    'pain_records',
    'symptom_records',
    'wound_records',
    'patient_alerts',
    'patient_alert_events',
    'nursing_care_plans',
    'patient_medications',
    'medication_adherence_logs',
    'patient_appointments',
    'notifications',
    'patient_messages',
    'patient_education_assignments'
  )
ORDER BY c.relname;

-- 2. Verify `anon` has NO direct privileges on private clinical or profile tables
SELECT
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;
-- Expected result: ONLY `surgery_types` (`SELECT`).

-- 3. Inventory of active RLS policies across public clinical & storage tables
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
    'profiles', 'nurse_profiles', 'patient_profiles', 'surgery_types',
    'patient_surgeries', 'patient_nurse_assignments', 'patient_invitations',
    'vital_sign_records', 'pain_records', 'symptom_records', 'wound_records',
    'patient_alerts', 'patient_alert_events', 'nursing_care_plans',
    'patient_medications', 'medication_adherence_logs', 'patient_appointments',
    'notifications', 'patient_messages', 'patient_education_assignments'
  ))
  OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'nurse_docs_%')
ORDER BY schemaname, tablename, cmd, policyname;

-- 4. Rolled-Back Cross-Patient & Cross-Nurse Isolation Test
BEGIN;

DO $$
DECLARE
  v_nurse_assigned UUID := gen_random_uuid();
  v_nurse_other    UUID := gen_random_uuid();
  v_patient_a      UUID := gen_random_uuid();
  v_patient_b      UUID := gen_random_uuid();
  v_med_b          UUID := gen_random_uuid();
  v_count          INTEGER;
BEGIN
  -- Seed minimal synthetic auth users (rolled back at transaction end)
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_nurse_assigned, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-nurse1@nursego.local', 'hash', NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
    (v_nurse_other,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-nurse2@nursego.local', 'hash', NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
    (v_patient_a,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-pat-a@nursego.local',  'hash', NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW()),
    (v_patient_b,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-pat-b@nursego.local',  'hash', NOW(), '{}'::jsonb, '{}'::jsonb, NOW(), NOW());

  INSERT INTO public.profiles (id, email, full_name, role) VALUES
    (v_nurse_assigned, 'test-nurse1@nursego.local', 'Perawat Satu', 'nurse'),
    (v_nurse_other,    'test-nurse2@nursego.local', 'Perawat Dua',  'nurse'),
    (v_patient_a,      'test-pat-a@nursego.local',  'Pasien A',     'patient'),
    (v_patient_b,      'test-pat-b@nursego.local',  'Pasien B',     'patient');

  INSERT INTO public.patient_nurse_assignments (
    patient_id, nurse_id, is_active, status, patient_approved_at, nurse_approved_at, ended_at
  ) VALUES (
    v_patient_a, v_nurse_assigned, TRUE, 'active', NOW(), NOW(), NULL
  );

  INSERT INTO public.vital_sign_records (patient_id, recorded_by, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, body_temperature, oxygen_saturation)
  VALUES
    (v_patient_a, v_patient_a, 120, 80, 76, 18, 36.6, 98),
    (v_patient_b, v_patient_b, 145, 92, 96, 22, 38.2, 94);

  INSERT INTO public.patient_medications (id, patient_id, medication_name, dosage, frequency)
  VALUES (v_med_b, v_patient_b, 'Cefadroxil', '500mg', '2x1 hari');

  -- Switch to Patient A authenticated context
  PERFORM set_config('role', 'authenticated', TRUE);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_patient_a::text, 'role', 'authenticated')::text, TRUE);

  -- Check 1: Patient A cannot read Patient B's vitals
  SELECT COUNT(*) INTO v_count FROM public.vital_sign_records WHERE patient_id = v_patient_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ISOLATION FAIL: Patient A read % rows of Patient B vitals', v_count;
  END IF;

  -- Check 2: Patient A cannot read Patient B's medications
  SELECT COUNT(*) INTO v_count FROM public.patient_medications WHERE patient_id = v_patient_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ISOLATION FAIL: Patient A read % rows of Patient B medications', v_count;
  END IF;

  -- Check 3: Patient A cannot escalate own role to nurse
  BEGIN
    UPDATE public.profiles SET role = 'nurse' WHERE id = v_patient_a;
    RAISE EXCEPTION 'ISOLATION FAIL: Patient A escalated own role to nurse';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Expected RLS block
  END;

  -- Check 4: Patient A cannot self-assign active relationship to unassigned Nurse 2
  BEGIN
    INSERT INTO public.patient_nurse_assignments (patient_id, nurse_id, is_active, status)
    VALUES (v_patient_a, v_nurse_other, TRUE, 'active');
    RAISE EXCEPTION 'ISOLATION FAIL: Patient A self-attached active nurse relationship';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Expected RLS block
  END;

  -- Check 5: Patient A cannot insert adherence log referencing Patient B's medication
  BEGIN
    INSERT INTO public.medication_adherence_logs (medication_id, patient_id, status)
    VALUES (v_med_b, v_patient_a, 'diminum');
    RAISE EXCEPTION 'ISOLATION FAIL: Patient A linked medication_adherence_logs to Patient B medication';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Expected RLS block
  END;

  -- Check 6: Pending/unapproved nurse assignment does NOT grant clinical access
  INSERT INTO public.patient_nurse_assignments (patient_id, nurse_id, is_active, status, initiated_by, nurse_approved_at)
  VALUES (v_patient_a, v_nurse_other, FALSE, 'pending_patient', v_nurse_other, NOW())
  ON CONFLICT (patient_id, nurse_id) DO UPDATE SET is_active = FALSE, status = 'pending_patient', ended_at = NULL;

  -- Switch to Unassigned / Pending Nurse context
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nurse_other::text, 'role', 'authenticated')::text, TRUE);

  SELECT COUNT(*) INTO v_count FROM public.vital_sign_records WHERE patient_id = v_patient_a;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'ISOLATION FAIL: Unassigned/pending nurse read % rows of Patient A vitals', v_count;
  END IF;

  -- Switch to Assigned Nurse context
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nurse_assigned::text, 'role', 'authenticated')::text, TRUE);

  SELECT COUNT(*) INTO v_count FROM public.vital_sign_records WHERE patient_id = v_patient_a;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ACCESS FAIL: Assigned nurse expected 1 vital row for Patient A, got %', v_count;
  END IF;

  RAISE NOTICE 'ALL RLS CROSS-PATIENT, CROSS-NURSE & CONSENT ISOLATION CHECKS PASSED.';
END $$;

ROLLBACK;
