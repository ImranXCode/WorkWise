-- ====================================================================
-- FIX: Organization Creation & Row-Level Security (RLS)
-- Run this script in your Supabase Dashboard -> SQL Editor -> Run
-- ====================================================================

-- 1. Ensure columns exist and constraints are flexible
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS next_employee_seq int NOT NULL DEFAULT 1;
ALTER TABLE public.organizations ALTER COLUMN created_by DROP NOT NULL;

-- 2. Add RLS policy for inserting organizations (so authenticated users can create their company workspace)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Add RLS policy for inserting/upserting own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- 4. Ensure next_employee_code handles sequence safely
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
  SELECT slug, coalesce(next_employee_seq, 1) INTO v_slug, v_seq
  FROM public.organizations WHERE id = p_org_id
  FOR UPDATE;

  v_prefix := upper(regexp_replace(coalesce(v_slug, 'EMP'), '[^a-zA-Z0-9]', '', 'g'));
  IF v_prefix = '' THEN v_prefix := 'EMP'; END IF;
  IF length(v_prefix) > 6 THEN v_prefix := substring(v_prefix from 1 for 6); END IF;

  UPDATE public.organizations
  SET next_employee_seq = coalesce(v_seq, 1) + 1
  WHERE id = p_org_id;

  RETURN v_prefix || '-' || lpad(coalesce(v_seq, 1)::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_employee_code(uuid) TO authenticated;

-- 5. Create or replace create_organization RPC function
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_slug text)
RETURNS TABLE (organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_email text;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE public.profiles.id = auth.uid()
      AND public.profiles.organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This account already belongs to an organization.';
  END IF;

  DELETE FROM public.profiles
  WHERE public.profiles.id = auth.uid()
    AND public.profiles.organization_id IS NULL;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Insert organization with created_by = auth.uid() directly
  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (p_name, p_slug, auth.uid())
  RETURNING id INTO v_org_id;

  BEGIN
    v_code := public.next_employee_code(v_org_id);
  EXCEPTION WHEN OTHERS THEN
    v_code := upper(regexp_replace(coalesce(p_slug, 'EMP'), '[^a-zA-Z0-9]', '', 'g')) || '-0001';
  END;

  INSERT INTO public.profiles (id, organization_id, email, full_name, role, employee_code)
  SELECT
    auth.uid(),
    v_org_id,
    v_email,
    coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''),
    'owner',
    v_code
  FROM auth.users WHERE id = auth.uid()
  ON CONFLICT (id) DO UPDATE SET
    organization_id = excluded.organization_id,
    role = 'owner',
    employee_code = coalesce(public.profiles.employee_code, excluded.employee_code);

  RETURN QUERY SELECT v_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;
