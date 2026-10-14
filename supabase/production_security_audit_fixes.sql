-- ====================================================================
-- WORKWISE PRODUCTION SECURITY AUDIT & HARDENING MIGRATION
-- Run this entire script in your Supabase Dashboard -> SQL Editor -> Run
-- Safe to re-run multiple times (idempotent).
-- ====================================================================

-- 1. SUPPORT ALL WORKWISE ROLES ON PROFILES & INVITATIONS
-- Expand role check constraint to include manager and hr roles defined in the application
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'hr', 'employee'));

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'manager', 'hr', 'employee'));

-- 2. HARDEN PRIVILEGE ESCALATION PREVENTION TRIGGER ON PROFILES
-- Prevent malicious or unauthorized assignment of owner/admin/manager/hr roles on both INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.prevent_unsafe_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Trusted system contexts (service role / internal DB tasks) bypass check
  IF auth.uid() IS NULL THEN
    RETURN new;
  END IF;

  -- A. INSERT GUARD: Verify caller cannot self-assign privileged roles directly
  IF tg_op = 'INSERT' THEN
    -- Owner assignment: Only permitted if the user is the authenticated creator of the target organization
    IF new.role = 'owner' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = new.organization_id AND created_by = auth.uid()
      ) THEN
        RAISE EXCEPTION 'Privilege escalation denied: You cannot assign yourself as owner of an organization you did not create.';
      END IF;
    -- Admin/Manager/HR assignment: Only permitted if user holds a valid invitation matching their authenticated email
    ELSIF new.role IN ('admin', 'manager', 'hr') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.invitations
        WHERE organization_id = new.organization_id
          AND lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
          AND role = new.role
      ) AND public.current_role() <> 'owner' THEN
        RAISE EXCEPTION 'Privilege escalation denied: You cannot assign yourself an administrative role without an approved invitation.';
      END IF;
    END IF;
    RETURN new;
  END IF;

  -- B. UPDATE GUARD: Only the confirmed organization owner can alter role or organization membership
  IF tg_op = 'UPDATE' THEN
    IF new.role IS DISTINCT FROM old.role OR new.organization_id IS DISTINCT FROM old.organization_id THEN
      IF public.current_role() <> 'owner' OR old.organization_id <> public.current_org_id() THEN
        RAISE EXCEPTION 'Permission denied: Only a workspace owner can change a member''s role or organization.';
      END IF;
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_unsafe_changes ON public.profiles;
CREATE TRIGGER profiles_prevent_unsafe_changes
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_unsafe_profile_changes();

-- 3. UPDATE INVITE_EMPLOYEE RPC TO SUPPORT MANAGER & HR ROLES
DROP FUNCTION IF EXISTS public.invite_employee(text, text);

CREATE OR REPLACE FUNCTION public.invite_employee(p_email text, p_role text DEFAULT 'employee')
RETURNS TABLE (invitation_id uuid, token uuid, employee_code text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text := public.current_role();
  v_id uuid;
  v_token uuid;
  v_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT (v_role IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Only an owner or admin can invite people.';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'hr', 'employee') THEN
    RAISE EXCEPTION 'Role must be admin, manager, hr, or employee.';
  END IF;

  -- Only owners can invite admins or managers; admins can invite HR or employees
  IF p_role IN ('admin', 'manager') AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the workspace owner can invite an admin or manager.';
  END IF;

  v_org_id := public.current_org_id();
  v_code := public.next_employee_code(v_org_id);

  INSERT INTO public.invitations (organization_id, email, role, invited_by, employee_code)
  VALUES (v_org_id, p_email, p_role, auth.uid(), v_code)
  RETURNING public.invitations.id, public.invitations.token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token, v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invite_employee(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invite_employee(text, text) TO authenticated;

-- 4. BIOMETRIC PRIVACY HARDENING: RESTRICT EMPLOYEE FACE DESCRIPTORS
-- Prevent employees from downloading co-workers' 128-dimensional biometric facial embeddings
ALTER TABLE public.employee_face_descriptors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "face_desc_select_org" ON public.employee_face_descriptors;
DROP POLICY IF EXISTS "face_desc_select_own_or_admin" ON public.employee_face_descriptors;

CREATE POLICY "face_desc_select_own_or_admin"
ON public.employee_face_descriptors FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
  OR (organization_id = public.current_org_id() AND public.is_owner_or_admin())
);

-- 5. NOTIFICATIONS RLS POLICY FOR APPLICATION EVENTS
-- Enable authenticated users within the same organization to insert notifications for task assignments & completions
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_insert_org" ON public.notifications;

CREATE POLICY "notifications_insert_org"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.current_org_id()
  AND (
    created_by = auth.uid()
    OR public.is_owner_or_admin()
  )
);

-- 6. UNIFY STRESS RECORDS SCHEMA & CONSTRAINTS
-- Ensure columns support 0-100 integer scores and proper event classification
DO $$
BEGIN
  -- Add predicted_class if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stress_records' AND column_name = 'predicted_class'
  ) THEN
    ALTER TABLE public.stress_records ADD COLUMN predicted_class text NOT NULL DEFAULT 'non_stress'
      CHECK (predicted_class IN ('stress', 'non_stress'));
  END IF;

  -- Add event_type if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stress_records' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE public.stress_records ADD COLUMN event_type text NOT NULL DEFAULT 'MANUAL'
      CHECK (event_type IN ('LOGIN', 'ATTENDANCE', 'BREAK_START', 'BREAK_END', 'LOGOUT', 'MANUAL'));
  END IF;

  -- Add baseline_comparison if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stress_records' AND column_name = 'baseline_comparison'
  ) THEN
    ALTER TABLE public.stress_records ADD COLUMN baseline_comparison text;
  END IF;

  -- Ensure stress_score supports 0 to 100
  ALTER TABLE public.stress_records DROP CONSTRAINT IF EXISTS stress_records_stress_score_check;
  ALTER TABLE public.stress_records ADD CONSTRAINT stress_records_stress_score_check
    CHECK (stress_score >= 0 AND stress_score <= 100);
END $$;

-- 7. RE-VERIFY SECURITY PRIVILEGES ON CORE RPCS
REVOKE EXECUTE ON FUNCTION public.create_organization(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.next_employee_code(uuid) FROM public, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.lookup_invite_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_invite_token(text) TO authenticated, anon;

-- Verification notification
COMMENT ON FUNCTION public.prevent_unsafe_profile_changes() IS 'WorkWise Security Hardened: Protects profile roles and tenant isolation';
