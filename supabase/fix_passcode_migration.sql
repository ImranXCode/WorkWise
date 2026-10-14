-- =============================================================
-- NEXORA – Fix Passcode Acceptance (run in Supabase SQL Editor)
-- =============================================================
-- This migration fixes the "passcode not working" issue.
-- Copy-paste the ENTIRE file into Supabase → SQL Editor → Run.
-- =============================================================

-- 1. Ensure the employee_code column exists on invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS employee_code text;

-- 2. Ensure the next_employee_seq column exists on organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS next_employee_seq int NOT NULL DEFAULT 1;

-- 3. Ensure unique constraint for employee_code per org on profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_org_employee_code_unique;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_org_employee_code_unique
  UNIQUE (organization_id, employee_code);

-- 4. Create / replace the employee code generator
CREATE OR REPLACE FUNCTION public.next_employee_code(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_seq int;
  v_prefix text;
BEGIN
  SELECT slug, next_employee_seq INTO v_slug, v_seq
  FROM public.organizations WHERE id = p_org_id
  FOR UPDATE;

  v_prefix := upper(regexp_replace(coalesce(v_slug, 'EMP'), '[^a-zA-Z0-9]', '', 'g'));
  IF length(v_prefix) > 6 THEN v_prefix := substring(v_prefix from 1 for 6); END IF;

  UPDATE public.organizations SET next_employee_seq = v_seq + 1 WHERE id = p_org_id;

  RETURN v_prefix || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_employee_code(uuid) FROM public, anon, authenticated;

-- 5. Drop ALL old accept_invitation signatures so PostgREST doesn't type-check as uuid
DROP FUNCTION IF EXISTS public.accept_invitation(uuid);
DROP FUNCTION IF EXISTS public.accept_invitation(text);

-- 6. Create the correct accept_invitation(text) that handles both UUID tokens AND passcodes
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS TABLE (organization_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_email text;
  v_clean text := lower(trim(p_token));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to join an organization.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE public.profiles.id = auth.uid()
      AND public.profiles.organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This account already belongs to an organization. Please log out to accept an invite with a different employee account.';
  END IF;

  -- Match by either the UUID token or the employee_code passcode
  SELECT * INTO v_invite FROM public.invitations
  WHERE (token::text = v_clean OR lower(employee_code) = v_clean)
    AND status = 'pending'
  LIMIT 1;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invitation passcode or link not found or already used.';
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_invite.id;
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF lower(v_email) <> lower(v_invite.email) THEN
    RAISE EXCEPTION 'This invitation was sent to %, but you are signed in as %.', v_invite.email, v_email;
  END IF;

  -- Remove any placeholder profile (unlinked to an org)
  DELETE FROM public.profiles
  WHERE public.profiles.id = auth.uid()
    AND public.profiles.organization_id IS NULL;

  -- Create the real profile in the invited org
  INSERT INTO public.profiles (id, organization_id, email, full_name, role, employee_code)
  SELECT
    auth.uid(),
    v_invite.organization_id,
    v_email,
    coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''),
    v_invite.role,
    v_invite.employee_code
  FROM auth.users WHERE id = auth.uid();

  UPDATE public.invitations SET status = 'accepted' WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.organization_id, v_invite.role;
END;
$$;

-- 7. Grant to BOTH authenticated AND anon (anon is needed during signup/onboarding flow)
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, anon;

-- 8. Create / replace the passcode-to-token resolver RPC
DROP FUNCTION IF EXISTS public.lookup_invite_token(text);

CREATE OR REPLACE FUNCTION public.lookup_invite_token(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN NULL;
  END IF;

  SELECT token::text INTO v_token
  FROM public.invitations
  WHERE (lower(employee_code) = lower(trim(p_code)) OR token::text = lower(trim(p_code)))
    AND status = 'pending'
  LIMIT 1;

  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_invite_token(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lookup_invite_token(text) TO authenticated, anon;

-- 9. Create / replace invite_employee (to ensure employee_code gets generated)
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
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'Only an owner or admin can invite people.';
  END IF;
  IF p_role NOT IN ('admin', 'employee') THEN
    RAISE EXCEPTION 'Role must be admin or employee.';
  END IF;
  IF p_role = 'admin' AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only an owner can invite an admin.';
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

-- =============================================================
-- DONE! Passcode acceptance should now work.
-- Test by entering an employee passcode (e.g. GROK-0012) on
-- the /accept-invite page while signed in as the invited email.
-- =============================================================
