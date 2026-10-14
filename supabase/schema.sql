-- ============================================================
-- CANONICAL SCHEMA -- Multi-tenant SaaS (organizations / profiles / invitations)
--
-- This file REPLACES phase3_profiles.sql, phase3_backfill_and_fixes.sql
-- and phase4_multitenant.sql. Those are deleted. From now on this is the
-- single source of truth: every schema change is made here first, then
-- run in Supabase SQL Editor, then committed.
--
-- Safe to re-run top to bottom at any time, on a fresh project OR on top
-- of an existing one already running the old phase3/phase4 migrations --
-- it tears down old single-tenant leftovers and any older versions of
-- these objects before recreating them.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Tear down old single-tenant (pre-multi-tenant) leftovers, if present
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop trigger if exists profiles_prevent_self_role_change on public.profiles;
drop function if exists public.prevent_self_role_change();

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

drop function if exists public.is_admin();

-- ------------------------------------------------------------
-- 1. organizations
-- ------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  industry text,
  company_size text,
  subscription_plan text not null default 'trial',
  subscription_status text not null default 'trialing',
  trial_start timestamptz not null default now(),
  trial_end timestamptz not null default now() + interval '14 days',
  employee_limit int not null default 10,
  next_employee_seq int not null default 1,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. profiles
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  full_name text,
  email text not null,
  role text not null default 'employee',
  avatar_url text,
  department text,
  designation text,
  employee_code text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- In case profiles pre-existed from the old single-tenant schema, make sure
-- every column/constraint this file expects actually exists on it.
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade;

alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
alter table public.profiles alter column role set default 'employee';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'manager', 'hr', 'employee'));

drop type if exists public.user_role;

-- Deleting a user from Supabase Dashboard -> Authentication -> Users
-- previously failed with "Database error deleting user" whenever that
-- account had ever created an organization or invited someone --
-- organizations.created_by and invitations.invited_by pointed at them
-- with no ON DELETE behavior, so Postgres blocked the delete outright.
-- Both are made nullable and set to null instead, so deleting a login
-- from the dashboard always succeeds, regardless of what that account did.
alter table public.organizations alter column created_by drop not null;
alter table public.organizations drop constraint if exists organizations_created_by_fkey;
alter table public.organizations add constraint organizations_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
alter table public.organizations add column if not exists next_employee_seq int not null default 1;

-- ------------------------------------------------------------
-- 3. invitations
-- ------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'employee' check (role in ('admin', 'manager', 'hr', 'employee')),
  invited_by uuid references public.profiles (id) on delete set null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  employee_code text,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

alter table public.invitations add column if not exists employee_code text;

-- In case invitations pre-existed from before invited_by was nullable.
alter table public.invitations alter column invited_by drop not null;
alter table public.invitations drop constraint if exists invitations_invited_by_fkey;
alter table public.invitations add constraint invitations_invited_by_fkey
  foreign key (invited_by) references public.profiles (id) on delete set null;

-- Every employee_code is unique within its own organization (two different
-- companies can still both have an "-0001", that's fine).
alter table public.profiles drop constraint if exists profiles_org_employee_code_unique;
alter table public.profiles add constraint profiles_org_employee_code_unique
  unique (organization_id, employee_code);

-- ------------------------------------------------------------
-- 4. updated_at helper + triggers
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. Helper functions used inside RLS policies
--    (security definer so they bypass RLS on their own internal lookup --
--    otherwise a policy calling these would recurse into itself)
-- ------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
security definer set search_path = public
stable
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns text
language sql
security definer set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(public.current_role() in ('owner', 'admin'), false);
$$;

-- Atomically reserves and returns the next employee code for an org, e.g.
-- "ACME-0001", "ACME-0002"... Locks the row so two simultaneous invites
-- (or an invite racing a company-creation) can never collide on a number.
create or replace function public.next_employee_code(p_org_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_slug text;
  v_seq int;
  v_prefix text;
begin
  select slug, coalesce(next_employee_seq, 1) into v_slug, v_seq
  from public.organizations where id = p_org_id
  for update;

  v_prefix := upper(regexp_replace(coalesce(v_slug, 'EMP'), '[^a-zA-Z0-9]', '', 'g'));
  if v_prefix = '' then
    v_prefix := 'EMP';
  end if;
  if length(v_prefix) > 6 then
    v_prefix := substring(v_prefix from 1 for 6);
  end if;

  update public.organizations
  set next_employee_seq = coalesce(v_seq, 1) + 1
  where id = p_org_id;

  return v_prefix || '-' || lpad(coalesce(v_seq, 1)::text, 4, '0');
end;
$$;

-- ------------------------------------------------------------
-- 6. Row Level Security -- the real gatekeeper, not the frontend
-- ------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;

drop policy if exists "organizations_select_own" on public.organizations;
create policy "organizations_select_own"
on public.organizations for select
to authenticated
using (id = public.current_org_id());

drop policy if exists "organizations_update_owner" on public.organizations;
create policy "organizations_update_owner"
on public.organizations for update
to authenticated
using (id = public.current_org_id() and public.current_role() = 'owner');

-- Allow authenticated users to insert an organization (for workspace creation)
drop policy if exists "organizations_insert" on public.organizations;
create policy "organizations_insert"
on public.organizations for insert
to authenticated
with check (true);

drop policy if exists "profiles_select_own_or_org_admin" on public.profiles;
create policy "profiles_select_own_or_org_admin"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

drop policy if exists "profiles_update_own_or_org_admin" on public.profiles;
create policy "profiles_update_own_or_org_admin"
on public.profiles for update
to authenticated
using (
  id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

-- Allow authenticated users to create/upsert their own profile row
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "invitations_select_org_admin" on public.invitations;
create policy "invitations_select_org_admin"
on public.invitations for select
to authenticated
using (organization_id = public.current_org_id() and public.is_owner_or_admin());

drop policy if exists "invitations_update_org_admin" on public.invitations;
create policy "invitations_update_org_admin"
on public.invitations for update
to authenticated
using (organization_id = public.current_org_id() and public.is_owner_or_admin());

-- No insert policy on invitations -- only created by invite_employee().
-- No select policy for the person accepting one -- they look their invite
-- up by its unguessable token through the accept_invitation() RPC instead,
-- which bypasses RLS safely as security definer. They never need direct
-- table access to invitations at all.

-- ------------------------------------------------------------
-- 7. Guard against a user quietly changing their own role/org via a
--    direct UPDATE (belt-and-suspenders on top of the RLS policy above)
-- ------------------------------------------------------------
create or replace function public.prevent_unsafe_profile_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    -- No user session attached (SQL Editor, service role, or an RPC that
    -- already did its own checks) -- treated as a trusted context.
    return new;
  end if;

  -- A. INSERT GUARD: Verify caller cannot self-assign privileged roles directly
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      if not exists (
        select 1 from public.organizations
        where id = new.organization_id and created_by = auth.uid()
      ) then
        raise exception 'Privilege escalation denied: You cannot assign yourself as owner of an organization you did not create.';
      end if;
    elsif new.role in ('admin', 'manager', 'hr') then
      if not exists (
        select 1 from public.invitations
        where organization_id = new.organization_id
          and lower(email) = lower((select email from auth.users where id = auth.uid()))
          and role = new.role
      ) and public.current_role() <> 'owner' then
        raise exception 'Privilege escalation denied: You cannot assign yourself an administrative role without an approved invitation.';
      end if;
    end if;
    return new;
  end if;

  -- B. UPDATE GUARD: Only the confirmed organization owner can alter role or organization membership
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role or new.organization_id is distinct from old.organization_id then
      if public.current_role() <> 'owner' or old.organization_id <> public.current_org_id() then
        raise exception 'Permission denied: Only a workspace owner can change a member''s role or organization.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_unsafe_changes on public.profiles;
create trigger profiles_prevent_unsafe_changes
before insert or update on public.profiles
for each row execute function public.prevent_unsafe_profile_changes();

-- ------------------------------------------------------------
-- 8. Onboarding RPCs -- the ONLY way organizations/profiles get created
--    or an employee joins one. Column references are explicitly
--    table-qualified (public.profiles.organization_id) to avoid
--    ambiguity with each function's own OUT parameter of the same name.
-- ------------------------------------------------------------

-- Create a brand-new company. Caller becomes its owner.
-- Fails if the caller already has a profile WITH an organization attached.
-- Any stale org-less profile row left over from an earlier failed attempt
-- is cleared automatically before the new one is created.
create or replace function public.create_organization(p_name text, p_slug text)
returns table (organization_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_email text;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  if exists (
    select 1 from public.profiles
    where public.profiles.id = auth.uid()
      and public.profiles.organization_id is not null
  ) then
    raise exception 'This account already belongs to an organization.';
  end if;

  delete from public.profiles
  where public.profiles.id = auth.uid()
    and public.profiles.organization_id is null;

  select email into v_email from auth.users where id = auth.uid();

  -- Insert organization with created_by = auth.uid() directly (references auth.users)
  insert into public.organizations (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning id into v_org_id;

  begin
    v_code := public.next_employee_code(v_org_id);
  exception when others then
    v_code := upper(regexp_replace(coalesce(p_slug, 'EMP'), '[^a-zA-Z0-9]', '', 'g')) || '-0001';
  end;

  insert into public.profiles (id, organization_id, email, full_name, role, employee_code)
  select
    auth.uid(),
    v_org_id,
    v_email,
    coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''),
    'owner',
    v_code
  from auth.users where id = auth.uid()
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    role = 'owner',
    employee_code = coalesce(public.profiles.employee_code, excluded.employee_code);

  return query select v_org_id;
end;
$$;

-- Accept a pending invitation by its token UUID or employee access passcode.
-- Creates the caller's profile in that organization with the invited role,
-- then marks the invite used.
drop function if exists public.accept_invitation(uuid);
drop function if exists public.accept_invitation(text);

create or replace function public.accept_invitation(p_token text)
returns table (organization_id uuid, role text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite record;
  v_email text;
  v_clean text := lower(trim(p_token));
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to join an organization.';
  end if;

  if exists (
    select 1 from public.profiles
    where public.profiles.id = auth.uid()
      and public.profiles.organization_id is not null
  ) then
    raise exception 'This account already belongs to an organization. Please log out to accept an invite with a different employee account.';
  end if;

  select * into v_invite from public.invitations
  where (token::text = v_clean or lower(employee_code) = v_clean)
    and status = 'pending'
  limit 1;

  if v_invite is null then
    raise exception 'Invitation passcode or link not found or already used.';
  end if;
  if v_invite.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_invite.id;
    raise exception 'This invitation has expired.';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_invite.email) then
    raise exception 'This invitation was sent to %, but you are signed in as %.', v_invite.email, v_email;
  end if;

  delete from public.profiles
  where public.profiles.id = auth.uid()
    and public.profiles.organization_id is null;

  insert into public.profiles (id, organization_id, email, full_name, role, employee_code)
  select
    auth.uid(),
    v_invite.organization_id,
    v_email,
    coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''),
    v_invite.role,
    v_invite.employee_code
  from auth.users where id = auth.uid();

  update public.invitations set status = 'accepted' where id = v_invite.id;

  perform public.log_activity(auth.uid(), v_invite.organization_id, 'joined_organization', '{}'::jsonb);

  return query select v_invite.organization_id, v_invite.role;
end;
$$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, anon;

-- Helper RPC: Resolves an employee passcode (e.g. GROK-0012) to its invitation UUID token safely
drop function if exists public.lookup_invite_token(text);

create or replace function public.lookup_invite_token(p_code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  if p_code is null or trim(p_code) = '' then
    return null;
  end if;

  select token::text into v_token
  from public.invitations
  where (lower(employee_code) = lower(trim(p_code)) or token::text = lower(trim(p_code)))
    and status = 'pending'
  limit 1;

  return v_token;
end;
$$;

revoke execute on function public.lookup_invite_token(text) from public, anon;
grant execute on function public.lookup_invite_token(text) to authenticated, anon;

-- Create an invitation. Owners can invite admins or employees;
-- admins can only invite employees.
drop function if exists public.invite_employee(text, text);
create or replace function public.invite_employee(p_email text, p_role text default 'employee')
returns table (invitation_id uuid, token uuid, employee_code text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_role text := public.current_role();
  v_id uuid;
  v_token uuid;
  v_code text;
begin
  if auth.uid() is null or not public.is_owner_or_admin() then
    raise exception 'Only an owner or admin can invite people.';
  end if;
  if p_role not in ('admin', 'manager', 'hr', 'employee') then
    raise exception 'Role must be admin, manager, hr, or employee.';
  end if;
  if p_role in ('admin', 'manager') and v_role <> 'owner' then
    raise exception 'Only the workspace owner can invite an admin or manager.';
  end if;

  v_org_id := public.current_org_id();
  v_code := public.next_employee_code(v_org_id);

  insert into public.invitations (organization_id, email, role, invited_by, employee_code)
  values (v_org_id, p_email, p_role, auth.uid(), v_code)
  returning public.invitations.id, public.invitations.token into v_id, v_token;

  return query select v_id, v_token, v_code;
end;
$$;

-- Remove someone from the organization (revokes membership; does not touch
-- their login). Owners can remove admins or employees; admins can only
-- remove employees. Nobody can remove the owner this way, and nobody can
-- remove themselves through this RPC.
create or replace function public.remove_member(p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role text := public.current_role();
  v_org_id uuid := public.current_org_id();
  v_target_role text;
  v_target_org uuid;
begin
  if auth.uid() is null or not public.is_owner_or_admin() then
    raise exception 'Only an owner or admin can remove a member.';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'You can''t remove yourself this way.';
  end if;

  select role, organization_id into v_target_role, v_target_org
  from public.profiles where public.profiles.id = p_profile_id;

  if v_target_org is null or v_target_org <> v_org_id then
    raise exception 'That person is not in your organization.';
  end if;
  if v_target_role = 'owner' then
    raise exception 'The workspace owner can''t be removed.';
  end if;
  if v_target_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'Only the owner can remove an admin.';
  end if;

  delete from public.profiles where public.profiles.id = p_profile_id;
end;
$$;

-- ------------------------------------------------------------
-- 8b. Notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null default 'system'
    check (type in ('name_change', 'join', 'leave', 'attendance', 'announcement', 'system', 'stress', 'task_assigned', 'task_due_soon', 'task_overdue', 'task_completed', 'task_updated')),
  message text not null,
  -- 'admin': only the owner/admin can see it (system-ish events).
  -- 'all': every member of the org can see it (announcements).
  -- 'user': target user + admins.
  visibility text not null default 'admin' check (visibility in ('admin', 'all', 'user')),
  target_user_id uuid references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- In case this table pre-existed from before multi-tenancy or type/visibility/created_by.
alter table public.notifications add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.notifications add column if not exists type text not null default 'system';
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('name_change', 'join', 'leave', 'attendance', 'announcement', 'system', 'stress', 'task_assigned', 'task_due_soon', 'task_overdue', 'task_completed', 'task_updated'));
alter table public.notifications add column if not exists visibility text not null default 'admin';
alter table public.notifications drop constraint if exists notifications_visibility_check;
alter table public.notifications add constraint notifications_visibility_check
  check (visibility in ('admin', 'all', 'user'));
alter table public.notifications add column if not exists target_user_id uuid references public.profiles (id) on delete cascade;
alter table public.notifications add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.notifications enable row level security;

-- Owners/admins see every notification in their org. Everyone else sees announcements or direct notifications.
drop policy if exists "notifications_select_org_admin" on public.notifications;
drop policy if exists "notifications_select_org" on public.notifications;
create policy "notifications_select_org"
on public.notifications for select
to authenticated
using (
  organization_id = public.current_org_id()
  and (
    visibility = 'all' 
    or target_user_id = auth.uid()
    or public.is_owner_or_admin()
  )
);

-- Insert policy: Authenticated members in org can dispatch notifications for task updates & events
drop policy if exists "notifications_insert_org" on public.notifications;
create policy "notifications_insert_org"
on public.notifications for insert
to authenticated
with check (
  organization_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or public.is_owner_or_admin()
  )
);
create or replace function public.notify_name_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.organization_id is not null
     and new.full_name is distinct from old.full_name
     and coalesce(new.full_name, '') <> ''
  then
    insert into public.notifications (organization_id, type, message)
    values (
      new.organization_id,
      'name_change',
      coalesce(nullif(old.full_name, ''), old.email) || ' updated their name to "' || new.full_name || '".'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_notify_name_change on public.profiles;
create trigger profiles_notify_name_change
after update of full_name on public.profiles
for each row execute function public.notify_name_change();

-- New member joined (their profile row was created with an organization).
create or replace function public.notify_member_joined()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.organization_id is not null then
    insert into public.notifications (organization_id, type, message)
    values (
      new.organization_id,
      'join',
      coalesce(nullif(new.full_name, ''), new.email) || ' joined the organization as ' || new.role || '.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_notify_joined on public.profiles;
create trigger profiles_notify_joined
after insert on public.profiles
for each row execute function public.notify_member_joined();

-- Member removed (remove_member() deletes the profiles row).
create or replace function public.notify_member_left()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.organization_id is not null then
    insert into public.notifications (organization_id, type, message)
    values (
      old.organization_id,
      'leave',
      coalesce(nullif(old.full_name, ''), old.email) || ' was removed from the organization.'
    );
  end if;
  return old;
end;
$$;

drop trigger if exists profiles_notify_left on public.profiles;
create trigger profiles_notify_left
after delete on public.profiles
for each row execute function public.notify_member_left();

-- Attendance: a check-in inserts the row, a check-out updates the same
-- row -- this one trigger function handles both.
create or replace function public.notify_attendance()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
  v_dept text;
  v_org uuid;
  v_time text;
begin
  select coalesce(nullif(full_name, ''), email), department, organization_id
  into v_name, v_dept, v_org
  from public.profiles where id = new.employee_id;

  if v_org is null then
    return new;
  end if;

  v_time := to_char(coalesce(new.check_in, now()) at time zone 'UTC', 'HH12:MI AM');

  if tg_op = 'INSERT' then
    if new.attendance_type = 'WORK_FROM_HOME' then
      insert into public.notifications (organization_id, type, visibility, message)
      values (
        v_org,
        'attendance',
        'admin',
        'Work From Home Request: ' || coalesce(v_name, 'An employee') ||
          case when v_dept is not null and v_dept <> '' then ' (' || v_dept || ')' else '' end ||
          ' has marked today (' || new.date::text || ' ' || v_time || ' UTC) as Work From Home.' ||
          case when new.wfh_reason is not null and trim(new.wfh_reason) <> '' then ' Reason: ' || trim(new.wfh_reason) else '' end
      );
    else
      insert into public.notifications (organization_id, type, visibility, message)
      values (v_org, 'attendance', 'admin', coalesce(v_name, 'An employee') || ' checked in at workplace (' || v_time || ' UTC).');
    end if;
  elsif tg_op = 'UPDATE' and new.check_out is not null and old.check_out is null then
    v_time := to_char(new.check_out at time zone 'UTC', 'HH12:MI AM');
    insert into public.notifications (organization_id, type, visibility, message)
    values (v_org, 'attendance', 'admin', coalesce(v_name, 'An employee') || ' checked out (' || v_time || ' UTC).');
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_notify on public.attendance;
create trigger attendance_notify
after insert or update on public.attendance
for each row execute function public.notify_attendance();

-- Owner/admin post an announcement visible to the whole organization.
create or replace function public.create_announcement(p_message text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_owner_or_admin() then
    raise exception 'Only an owner or admin can post announcements.';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Announcement can''t be empty.';
  end if;

  insert into public.notifications (organization_id, type, message, visibility, created_by)
  values (public.current_org_id(), 'announcement', trim(p_message), 'all', auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. Lock down who can even attempt to call these RPCs.
--    Every function here already checks auth.uid() internally, so an
--    anonymous caller was never actually able to do anything -- but this
--    removes the ability to call them at all as anon/public, which is
--    what Supabase's Security Advisor flags and is simply best practice.
-- ------------------------------------------------------------
revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

revoke execute on function public.next_employee_code(uuid) from public, anon, authenticated;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated, anon;

revoke execute on function public.invite_employee(text, text) from public, anon;
grant execute on function public.invite_employee(text, text) to authenticated;

revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

revoke execute on function public.create_announcement(text) from public, anon;
grant execute on function public.create_announcement(text) to authenticated;

revoke execute on function public.current_org_id() from public, anon;
grant execute on function public.current_org_id() to authenticated;

revoke execute on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;

revoke execute on function public.is_owner_or_admin() from public, anon;
grant execute on function public.is_owner_or_admin() to authenticated;

-- Trigger-only functions -- never called directly by a client, but
-- lock down execute permission on them too for the same reason as above.
revoke execute on function public.set_updated_at() from public, anon;
grant execute on function public.set_updated_at() to authenticated;

revoke execute on function public.prevent_unsafe_profile_changes() from public, anon;
grant execute on function public.prevent_unsafe_profile_changes() to authenticated;

revoke execute on function public.notify_name_change() from public, anon;
grant execute on function public.notify_name_change() to authenticated;

-- ------------------------------------------------------------
-- 10. Attendance (Phase 5)
--
--    v1 is manual check-in/check-out only. The columns for face and
--    geofence verification are here (nullable) so the original
--    liveness/face-recognition and geofencing logic can be layered on
--    top later without a schema change -- they just start populating
--    columns that already exist instead of being required now.
-- ------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  date date not null default current_date,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present', 'late', 'absent', 'half_day', 'rejected')),
  attendance_type text not null default 'WORKPLACE' check (attendance_type in ('WORKPLACE', 'WORK_FROM_HOME')),
  approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  wfh_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  location_verified boolean,
  face_verified boolean,
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);

drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at
before update on public.attendance
for each row execute function public.set_updated_at();

alter table public.attendance enable row level security;

drop policy if exists "attendance_select_own_or_org_admin" on public.attendance;
create policy "attendance_select_own_or_org_admin"
on public.attendance for select
to authenticated
using (
  employee_id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

-- No direct insert/update policy -- every write goes through
-- check_in()/check_out() below, so an employee can never backdate their
-- own attendance or edit someone else's by calling the table directly.

-- Employee checks themself in for today. One row per employee per day
-- (the unique constraint above); calling this twice in a day is a no-op
-- error, not a duplicate or overwrite.
create or replace function public.check_in()
returns table (id uuid, check_in timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_check_in timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'You are not part of an organization.';
  end if;

  if exists (
    select 1 from public.attendance
    where public.attendance.employee_id = auth.uid()
      and public.attendance.date = current_date
  ) then
    raise exception 'You have already checked in today.';
  end if;

  insert into public.attendance (organization_id, employee_id, date, check_in)
  values (v_org_id, auth.uid(), current_date, now())
  returning public.attendance.id, public.attendance.check_in into v_id, v_check_in;

  return query select v_id, v_check_in;
end;
$$;

-- Employee checks themself out. Only valid same-day, after a check-in
-- exists and before a check-out already does.
create or replace function public.check_out()
returns table (id uuid, check_out timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.attendance;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select * into v_row from public.attendance
  where public.attendance.employee_id = auth.uid()
    and public.attendance.date = current_date;

  if v_row is null then
    raise exception 'You have not checked in today.';
  end if;
  if v_row.check_out is not null then
    raise exception 'You have already checked out today.';
  end if;

  update public.attendance
  set check_out = now()
  where public.attendance.id = v_row.id;

  return query
    select public.attendance.id, public.attendance.check_out
    from public.attendance
    where public.attendance.id = v_row.id;
end;
$$;

revoke execute on function public.check_in() from public, anon;
grant execute on function public.check_in() to authenticated;

revoke execute on function public.check_out() from public, anon;
grant execute on function public.check_out() to authenticated;

-- ------------------------------------------------------------
-- 11. Stress monitoring (Phase 5)
--
--    Inference runs client-side in the browser (TensorFlow.js), since
--    this project has no Python/backend server to host the trained
--    Keras model -- only Supabase + a static frontend. The browser scans
--    the face, runs the model, and submits only the *result* (label +
--    confidence) through this RPC. The raw camera frame never leaves
--    the browser or gets stored anywhere.
-- ------------------------------------------------------------
create table if not exists public.stress_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  stress_level text not null check (stress_level in ('stress', 'non_stress')),
  stress_score numeric not null check (stress_score >= 0 and stress_score <= 1),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  model_version text not null default 'fer2013-v1',
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.stress_records enable row level security;

drop policy if exists "stress_select_own_or_org_admin" on public.stress_records;
create policy "stress_select_own_or_org_admin"
on public.stress_records for select
to authenticated
using (
  employee_id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

-- No direct insert policy -- every reading goes through record_stress()
-- below, so a user can only ever submit a reading as themselves.

create or replace function public.record_stress(
  p_stress_level text,
  p_stress_score numeric,
  p_confidence numeric,
  p_model_version text default 'fer2013-v1'
)
returns table (id uuid, detected_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_detected_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;
  if p_stress_level not in ('stress', 'non_stress') then
    raise exception 'Invalid stress level.';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'You are not part of an organization.';
  end if;

  insert into public.stress_records (
    organization_id, employee_id, stress_level, stress_score, confidence, model_version
  )
  values (v_org_id, auth.uid(), p_stress_level, p_stress_score, p_confidence, p_model_version)
  returning public.stress_records.id, public.stress_records.detected_at
    into v_id, v_detected_at;

  return query select v_id, v_detected_at;
end;
$$;

revoke execute on function public.record_stress(text, numeric, numeric, text) from public, anon;
grant execute on function public.record_stress(text, numeric, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 12. Activity feed (Phase 5)
--
--    A simple event log, not something users write to directly --
--    entries get added automatically by other RPCs (check-in, check-out,
--    joining an org) via log_activity(). No insert policy exists on the
--    table for that reason; only select.
-- ------------------------------------------------------------
create table if not exists public.employee_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  activity_type text not null,
  activity_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_activity_org_created_idx
  on public.employee_activity (organization_id, created_at desc);

alter table public.employee_activity enable row level security;

drop policy if exists "activity_select_own_or_org_admin" on public.employee_activity;
create policy "activity_select_own_or_org_admin"
on public.employee_activity for select
to authenticated
using (
  employee_id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

-- Internal helper -- other security-definer functions call this to record
-- an event. Not something the client calls directly (no grant to
-- authenticated below), so it can't be spammed or backdated by a user.
create or replace function public.log_activity(
  p_employee_id uuid,
  p_org_id uuid,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.employee_activity (organization_id, employee_id, activity_type, activity_data)
  values (p_org_id, p_employee_id, p_type, p_data);
end;
$$;

revoke execute on function public.log_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- Wire logging into the events that already exist. Re-declaring these
-- functions in full (create or replace) is safe/idempotent like
-- everything else in this file.
--
-- Old overloads must be dropped by exact signature, not just replaced --
-- Postgres allows several check_in() overloads to coexist (that's how
-- overloading works), which made PostgREST's rpc() call ambiguous once
-- both the old 3-arg and this 5-arg version existed at once.
drop function if exists public.check_in();
drop function if exists public.check_in(boolean, numeric, boolean);

create or replace function public.check_in(
  p_face_verified boolean default null,
  p_confidence numeric default null,
  p_location_verified boolean default null,
  p_lat double precision default null,
  p_lon double precision default null
)
returns table (id uuid, check_in timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_check_in timestamptz;
  v_org public.organizations;
  v_distance double precision;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'You are not part of an organization.';
  end if;

  select * into v_org from public.organizations where public.organizations.id = v_org_id;

  if v_org.geofencing_enabled then
    if p_lat is null or p_lon is null then
      raise exception 'Location is required to check in from this organization.';
    end if;
    v_distance := public.geo_distance_meters(v_org.geofence_lat, v_org.geofence_lon, p_lat, p_lon);
    if v_distance > v_org.geofence_radius_meters then
      raise exception 'Outside geofence: you are %m from the office, allowed radius is %m.',
        round(v_distance), v_org.geofence_radius_meters;
    end if;
    p_location_verified := true;
  end if;

  if exists (
    select 1 from public.attendance
    where public.attendance.employee_id = auth.uid()
      and public.attendance.date = current_date
  ) then
    raise exception 'You have already checked in today.';
  end if;

  insert into public.attendance
    (organization_id, employee_id, date, check_in, face_verified, confidence, location_verified)
  values
    (v_org_id, auth.uid(), current_date, now(), p_face_verified, p_confidence, p_location_verified)
  returning public.attendance.id, public.attendance.check_in into v_id, v_check_in;

  perform public.log_activity(auth.uid(), v_org_id, 'checked_in', '{}'::jsonb);

  return query select v_id, v_check_in;
end;
$$;

revoke execute on function public.check_in(boolean, numeric, boolean, double precision, double precision) from public, anon;
grant execute on function public.check_in(boolean, numeric, boolean, double precision, double precision) to authenticated;

create or replace function public.check_out()
returns table (id uuid, check_out timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.attendance;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select * into v_row from public.attendance
  where public.attendance.employee_id = auth.uid()
    and public.attendance.date = current_date;

  if v_row is null then
    raise exception 'You have not checked in today.';
  end if;
  if v_row.check_out is not null then
    raise exception 'You have already checked out today.';
  end if;

  update public.attendance
  set check_out = now()
  where public.attendance.id = v_row.id;

  perform public.log_activity(auth.uid(), v_row.organization_id, 'checked_out', '{}'::jsonb);

  return query
    select public.attendance.id, public.attendance.check_out
    from public.attendance
    where public.attendance.id = v_row.id;
end;
$$;

-- ------------------------------------------------------------
-- Work From Home (WFH) Attendance RPCs
-- ------------------------------------------------------------

-- Employee checks in as Work From Home. One row per employee per day;
-- prevents contradictory workplace check-in or duplicate WFH submissions.
create or replace function public.check_in_wfh(p_reason text default null)
returns table (
  id uuid,
  check_in timestamptz,
  attendance_type text,
  approval_status text,
  status text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_check_in timestamptz;
  v_type text := 'WORK_FROM_HOME';
  v_approval text := 'pending';
  v_status text := 'present';
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'You are not part of an organization.';
  end if;

  if exists (
    select 1 from public.attendance
    where public.attendance.employee_id = auth.uid()
      and public.attendance.date = current_date
  ) then
    raise exception 'You have already recorded attendance for today.';
  end if;

  insert into public.attendance (
    organization_id,
    employee_id,
    date,
    check_in,
    attendance_type,
    status,
    approval_status,
    wfh_reason,
    created_by
  )
  values (
    v_org_id,
    auth.uid(),
    current_date,
    now(),
    v_type,
    v_status,
    v_approval,
    nullif(trim(p_reason), ''),
    auth.uid()
  )
  returning
    public.attendance.id,
    public.attendance.check_in,
    public.attendance.attendance_type,
    public.attendance.approval_status,
    public.attendance.status
  into v_id, v_check_in, v_type, v_approval, v_status;

  perform public.log_activity(
    auth.uid(),
    v_org_id,
    'checked_in_wfh',
    jsonb_build_object('reason', p_reason, 'date', current_date)
  );

  return query select v_id, v_check_in, v_type, v_approval, v_status;
end;
$$;

revoke execute on function public.check_in_wfh(text) from public, anon;
grant execute on function public.check_in_wfh(text) to authenticated;

-- Owner or Admin reviews (approves or rejects) a Work From Home attendance request.
create or replace function public.review_wfh_attendance(
  p_attendance_id uuid,
  p_action text
)
returns table (
  id uuid,
  approval_status text,
  status text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_row public.attendance;
  v_admin_name text;
  v_emp_id uuid;
  v_date date;
  v_action_clean text;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  if not public.is_owner_or_admin() then
    raise exception 'Only an owner or admin can review Work From Home attendance.';
  end if;

  v_org_id := public.current_org_id();
  if v_org_id is null then
    raise exception 'You are not part of an organization.';
  end if;

  v_action_clean := lower(trim(p_action));
  if v_action_clean not in ('approved', 'rejected') then
    raise exception 'Action must be "approved" or "rejected".';
  end if;

  select * into v_row from public.attendance
  where public.attendance.id = p_attendance_id
    and public.attendance.organization_id = v_org_id;

  if v_row is null then
    raise exception 'Attendance record not found.';
  end if;

  select coalesce(nullif(full_name, ''), email) into v_admin_name
  from public.profiles where id = auth.uid();

  v_emp_id := v_row.employee_id;
  v_date := v_row.date;

  update public.attendance
  set approval_status = v_action_clean,
      status = case when v_action_clean = 'rejected' then 'rejected' else 'present' end,
      updated_at = now()
  where public.attendance.id = p_attendance_id;

  insert into public.notifications (
    organization_id,
    type,
    visibility,
    target_user_id,
    message
  )
  values (
    v_org_id,
    'attendance',
    'user',
    v_emp_id,
    'Your Work From Home request for ' || v_date::text || ' has been ' || upper(v_action_clean) || ' by ' || coalesce(v_admin_name, 'Admin') || '.'
  );

  perform public.log_activity(
    auth.uid(),
    v_org_id,
    'reviewed_wfh',
    jsonb_build_object('attendance_id', p_attendance_id, 'action', v_action_clean, 'employee_id', v_emp_id)
  );

  return query
    select public.attendance.id, public.attendance.approval_status, public.attendance.status
    from public.attendance
    where public.attendance.id = p_attendance_id;
end;
$$;

revoke execute on function public.review_wfh_attendance(uuid, text) from public, anon;
grant execute on function public.review_wfh_attendance(uuid, text) to authenticated;

-- Employee cancels their pending Work From Home request for today.
create or replace function public.cancel_wfh(p_attendance_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.attendance;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in.';
  end if;

  select * into v_row from public.attendance
  where id = p_attendance_id
    and employee_id = auth.uid()
    and date = current_date;

  if v_row is null then
    raise exception 'Pending Work From Home request for today not found.';
  end if;

  if v_row.approval_status <> 'pending' then
    raise exception 'Only pending Work From Home requests can be cancelled.';
  end if;

  delete from public.attendance where id = p_attendance_id;

  perform public.log_activity(
    auth.uid(),
    v_row.organization_id,
    'cancelled_wfh',
    jsonb_build_object('attendance_id', p_attendance_id, 'date', current_date)
  );

  return true;
end;
$$;

revoke execute on function public.cancel_wfh(uuid) from public, anon;
grant execute on function public.cancel_wfh(uuid) to authenticated;


-- ============================================================
-- Face recognition (browser-native, face-api.js). One row per captured
-- angle per employee; matching compares a live descriptor against every
-- row for a candidate and takes the best (lowest) distance.
-- ============================================================
create table if not exists public.employee_face_descriptors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  descriptor double precision[] not null check (array_length(descriptor, 1) = 128),
  created_at timestamptz not null default now()
);

alter table public.employee_face_descriptors enable row level security;

drop policy if exists "face_desc_select_org" on public.employee_face_descriptors;
drop policy if exists "face_desc_select_own_or_admin" on public.employee_face_descriptors;
create policy "face_desc_select_own_or_admin"
on public.employee_face_descriptors for select
to authenticated
using (
  employee_id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

drop policy if exists "face_desc_insert_own" on public.employee_face_descriptors;
create policy "face_desc_insert_own"
on public.employee_face_descriptors for insert
with check (employee_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists "face_desc_delete_own_or_admin" on public.employee_face_descriptors;
create policy "face_desc_delete_own_or_admin"
on public.employee_face_descriptors for delete
using (
  employee_id = auth.uid()
  or (organization_id = public.current_org_id() and public.is_owner_or_admin())
);

-- ============================================================
-- Geofencing -- office location + radius, owner/admin editable via the
-- update_geofence() RPC below (not a direct table policy, since only
-- owner may otherwise edit organizations, but geofencing is admin+owner).
-- ============================================================
alter table public.organizations add column if not exists geofence_lat double precision;
alter table public.organizations add column if not exists geofence_lon double precision;
alter table public.organizations add column if not exists geofence_radius_meters int not null default 150;
alter table public.organizations add column if not exists geofencing_enabled boolean not null default false;

-- Haversine distance in meters between two lat/lon points.
create or replace function public.geo_distance_meters(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2
  ));
$$;

create or replace function public.update_geofence(
  p_lat double precision,
  p_lon double precision,
  p_radius_meters int,
  p_enabled boolean
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_role() not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can change the geofence.';
  end if;
  if p_enabled and (p_lat is null or p_lon is null) then
    raise exception 'Set a location before enabling geofencing.';
  end if;

  update public.organizations
  set geofence_lat = p_lat,
      geofence_lon = p_lon,
      geofence_radius_meters = coalesce(p_radius_meters, geofence_radius_meters),
      geofencing_enabled = p_enabled
  where id = public.current_org_id();
end;
$$;

revoke execute on function public.update_geofence(double precision, double precision, int, boolean) from public, anon;
grant execute on function public.update_geofence(double precision, double precision, int, boolean) to authenticated;

-- ------------------------------------------------------------
-- 13. Task Management Module
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'completed', 'cancelled')),
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  blocked_reason text,
  start_date timestamptz default now(),
  due_date timestamptz,
  estimated_hours numeric default 0,
  department text,
  tags text[] default '{}'::text[],
  checklist jsonb default '[]'::jsonb,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.tasks add column if not exists title text;
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists assigned_to uuid references public.profiles (id) on delete set null;
alter table public.tasks add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.tasks add column if not exists priority text default 'medium';
alter table public.tasks add column if not exists status text default 'todo';
alter table public.tasks add column if not exists progress int default 0;
alter table public.tasks add column if not exists blocked_reason text;
alter table public.tasks add column if not exists start_date timestamptz default now();
alter table public.tasks add column if not exists due_date timestamptz;
alter table public.tasks add column if not exists estimated_hours numeric default 0;
alter table public.tasks add column if not exists department text;
alter table public.tasks add column if not exists tags text[] default '{}'::text[];
alter table public.tasks add column if not exists checklist jsonb default '[]'::jsonb;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists completed_by uuid references public.profiles (id) on delete set null;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create index if not exists tasks_org_assigned_idx on public.tasks (organization_id, assigned_to);
create index if not exists tasks_org_status_idx on public.tasks (organization_id, status);

alter table public.tasks enable row level security;

-- Select policy: Owners/admins see all tasks in org; employees see assigned/created tasks in org
drop policy if exists "tasks_select_org" on public.tasks;
create policy "tasks_select_org"
on public.tasks for select
to authenticated
using (
  organization_id = public.current_org_id()
  and (
    public.is_owner_or_admin()
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  )
);

-- Insert policy: Owners/admins or authenticated users in org
drop policy if exists "tasks_insert_org" on public.tasks;
create policy "tasks_insert_org"
on public.tasks for insert
to authenticated
with check (
  organization_id = public.current_org_id()
  and (
    public.is_owner_or_admin()
    or created_by = auth.uid()
  )
);

-- Update policy: Owners/admins update anything in org; assigned employee updates status/progress/checklist
drop policy if exists "tasks_update_org" on public.tasks;
create policy "tasks_update_org"
on public.tasks for update
to authenticated
using (
  organization_id = public.current_org_id()
  and (
    public.is_owner_or_admin()
    or assigned_to = auth.uid()
  )
);

-- Delete policy: Only owners/admins
drop policy if exists "tasks_delete_org" on public.tasks;
create policy "tasks_delete_org"
on public.tasks for delete
to authenticated
using (
  organization_id = public.current_org_id()
  and public.is_owner_or_admin()
);

-- Task Comments
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment text not null,
  attachment_url text,
  attachment_name text,
  created_at timestamptz not null default now()
);

alter table public.task_comments add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.task_comments add column if not exists task_id uuid references public.tasks (id) on delete cascade;
alter table public.task_comments add column if not exists user_id uuid references public.profiles (id) on delete cascade;
alter table public.task_comments add column if not exists comment text;
alter table public.task_comments add column if not exists attachment_url text;
alter table public.task_comments add column if not exists attachment_name text;

create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at asc);

alter table public.task_comments enable row level security;

drop policy if exists "task_comments_select" on public.task_comments;
create policy "task_comments_select"
on public.task_comments for select
to authenticated
using (organization_id = public.current_org_id());

drop policy if exists "task_comments_insert" on public.task_comments;
create policy "task_comments_insert"
on public.task_comments for insert
to authenticated
with check (organization_id = public.current_org_id() and user_id = auth.uid());

-- Task Activity Audit
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.task_activity add column if not exists organization_id uuid references public.organizations (id) on delete cascade;
alter table public.task_activity add column if not exists task_id uuid references public.tasks (id) on delete cascade;
alter table public.task_activity add column if not exists user_id uuid references public.profiles (id) on delete set null;
alter table public.task_activity add column if not exists action text;
alter table public.task_activity add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists task_activity_task_idx on public.task_activity (task_id, created_at desc);

alter table public.task_activity enable row level security;

drop policy if exists "task_activity_select" on public.task_activity;
create policy "task_activity_select"
on public.task_activity for select
to authenticated
using (organization_id = public.current_org_id());

drop policy if exists "task_activity_insert" on public.task_activity;
create policy "task_activity_insert"
on public.task_activity for insert
to authenticated
with check (organization_id = public.current_org_id());

-- Helper function to trigger task notifications & activity logs safely
create or replace function public.log_task_activity(
  p_task_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.tasks where id = p_task_id;
  if v_org_id is not null then
    insert into public.task_activity (organization_id, task_id, user_id, action, metadata)
    values (v_org_id, p_task_id, auth.uid(), p_action, p_metadata);
  end if;
end;
$$;

revoke execute on function public.log_task_activity(uuid, text, jsonb) from public, anon;
grant execute on function public.log_task_activity(uuid, text, jsonb) to authenticated;

-- ============================================================
-- Done. Task Management tables and policies initialized.
-- ============================================================

-- ------------------------------------------------------------
-- 15. Stress Detection & Safe Continuous Improvement Pipeline
-- ------------------------------------------------------------

-- Model Versions tracking
create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  version_tag text not null unique,
  is_active_production boolean not null default false,
  backbone text not null default 'mobilenet_v2',
  accuracy float,
  precision_score float,
  recall_score float,
  f1_score float,
  training_sample_count int default 0,
  trained_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Initial seed version if missing
insert into public.model_versions (version_tag, is_active_production, backbone, accuracy, precision_score, recall_score, f1_score, training_sample_count)
values ('stress_model_v1.0', true, 'mobilenet_v2', 0.912, 0.905, 0.920, 0.912, 980)
on conflict (version_tag) do nothing;

-- Stress Records (predictions)
create table if not exists public.stress_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  employee_id uuid references public.profiles (id) on delete cascade,
  model_version text not null default 'stress_model_v1.0',
  predicted_class text not null check (predicted_class in ('stress', 'non_stress')),
  confidence float not null check (confidence >= 0.0 and confidence <= 1.0),
  stress_score int not null check (stress_score >= 0 and stress_score <= 100),
  event_type text not null default 'MANUAL' check (event_type in ('LOGIN', 'ATTENDANCE', 'BREAK_START', 'BREAK_END', 'LOGOUT', 'MANUAL')),
  baseline_comparison text,
  created_at timestamptz not null default now()
);

alter table public.stress_records add column if not exists event_type text not null default 'MANUAL' check (event_type in ('LOGIN', 'ATTENDANCE', 'BREAK_START', 'BREAK_END', 'LOGOUT', 'MANUAL'));
alter table public.stress_records add column if not exists baseline_comparison text;

-- Stress Feedback (optional accuracy verification)
create table if not exists public.stress_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  record_id uuid references public.stress_records (id) on delete cascade,
  employee_id uuid references public.profiles (id) on delete cascade,
  is_accurate boolean not null,
  feedback_rating text check (feedback_rating in ('very_accurate', 'accurate', 'not_sure', 'not_accurate')),
  corrected_class text check (corrected_class in ('stress', 'non_stress')),
  user_feedback text,
  created_at timestamptz not null default now()
);

alter table public.stress_feedback add column if not exists feedback_rating text check (feedback_rating in ('very_accurate', 'accurate', 'not_sure', 'not_accurate'));

-- Candidate Training Samples (validated feedback pipeline)
create table if not exists public.candidate_training_samples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  record_id uuid references public.stress_records (id) on delete cascade,
  validated_class text not null check (validated_class in ('stress', 'non_stress')),
  status text not null default 'pending_validation' check (status in ('pending_validation', 'approved', 'rejected')),
  validated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Model Evaluations (comparative benchmarks)
create table if not exists public.model_evaluations (
  id uuid primary key default gen_random_uuid(),
  candidate_version text not null,
  production_version text not null,
  candidate_accuracy float not null,
  production_accuracy float not null,
  decision text not null check (decision in ('promoted_to_production', 'rejected_kept_current')),
  evaluated_at timestamptz not null default now()
);

-- RLS Enablement
alter table public.model_versions enable row level security;
alter table public.stress_records enable row level security;
alter table public.stress_feedback enable row level security;
alter table public.candidate_training_samples enable row level security;
alter table public.model_evaluations enable row level security;

-- Model Versions Policies
drop policy if exists "model_versions_select_all" on public.model_versions;
create policy "model_versions_select_all" on public.model_versions
  for select using (auth.role() = 'authenticated');

-- Stress Records Policies
drop policy if exists "stress_records_select_own_or_admin" on public.stress_records;
create policy "stress_records_select_own_or_admin" on public.stress_records
  for select using (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and (
      employee_id = auth.uid()
      or (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
    )
  );

drop policy if exists "stress_records_insert_own" on public.stress_records;
create policy "stress_records_insert_own" on public.stress_records
  for insert with check (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and employee_id = auth.uid()
  );

-- Stress Feedback Policies
drop policy if exists "stress_feedback_select_own_or_admin" on public.stress_feedback;
create policy "stress_feedback_select_own_or_admin" on public.stress_feedback
  for select using (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and (
      employee_id = auth.uid()
      or (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
    )
  );

drop policy if exists "stress_feedback_insert_own" on public.stress_feedback;
create policy "stress_feedback_insert_own" on public.stress_feedback
  for insert with check (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and employee_id = auth.uid()
  );

-- Candidate Training Samples Policies
drop policy if exists "candidate_samples_select_admin" on public.candidate_training_samples;
create policy "candidate_samples_select_admin" on public.candidate_training_samples
  for select using (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  );

drop policy if exists "candidate_samples_all_admin" on public.candidate_training_samples;
create policy "candidate_samples_all_admin" on public.candidate_training_samples
  for all using (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  );

-- Model Evaluations Policies
drop policy if exists "model_evaluations_select_admin" on public.model_evaluations;
create policy "model_evaluations_select_admin" on public.model_evaluations
  for select using (
    (select role from public.profiles where id = auth.uid()) in ('owner', 'admin')
  );

-- ------------------------------------------------------------
-- 16. AI Chatbot Conversations & Messages History
-- ------------------------------------------------------------
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Workplace AI Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;

drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own"
on public.ai_conversations for select
to authenticated
using (user_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own"
on public.ai_conversations for insert
to authenticated
with check (user_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists "ai_conversations_delete_own" on public.ai_conversations;
create policy "ai_conversations_delete_own"
on public.ai_conversations for delete
to authenticated
using (user_id = auth.uid() and organization_id = public.current_org_id());

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'model', 'assistant')),
  content text not null,
  tool_calls jsonb default null,
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;

drop policy if exists "ai_messages_select_own" on public.ai_messages;
create policy "ai_messages_select_own"
on public.ai_messages for select
to authenticated
using (user_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists "ai_messages_insert_own" on public.ai_messages;
create policy "ai_messages_insert_own"
on public.ai_messages for insert
to authenticated
with check (user_id = auth.uid() and organization_id = public.current_org_id());

-- ------------------------------------------------------------
-- 18. Daily Mood Check-ins  (Wellbeing page)
-- ------------------------------------------------------------
create table if not exists public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  mood text not null check (mood in ('great', 'good', 'okay', 'low', 'stressed')),
  emoji text not null default '😐',
  note text,
  created_at timestamptz not null default now()
);

alter table public.mood_checkins enable row level security;

drop policy if exists "mood_checkins_select_own" on public.mood_checkins;
create policy "mood_checkins_select_own"
on public.mood_checkins for select
to authenticated
using (employee_id = auth.uid() and organization_id = public.current_org_id());

drop policy if exists "mood_checkins_insert_own" on public.mood_checkins;
create policy "mood_checkins_insert_own"
on public.mood_checkins for insert
to authenticated
with check (employee_id = auth.uid() and organization_id = public.current_org_id());

-- Owners/admins can view all mood check-ins in their org for reporting
drop policy if exists "mood_checkins_select_admin" on public.mood_checkins;
create policy "mood_checkins_select_admin"
on public.mood_checkins for select
to authenticated
using (
  organization_id = public.current_org_id()
  and public.is_owner_or_admin()
);

