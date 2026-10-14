-- ============================================================
-- Work From Home (WFH) Attendance Migration
-- Run this script in the Supabase SQL Editor.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Add WFH columns to public.attendance table
alter table public.attendance
  add column if not exists attendance_type text not null default 'WORKPLACE'
    check (attendance_type in ('WORKPLACE', 'WORK_FROM_HOME')),
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists wfh_reason text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Update status check constraint on public.attendance to support 'rejected'
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'late', 'absent', 'half_day', 'rejected'));

-- Create index for faster querying by date, org, and attendance_type
create index if not exists idx_attendance_org_type_date
  on public.attendance (organization_id, attendance_type, date);

-- 2. Update attendance notification trigger to support WFH events
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

-- 3. RPC: check_in_wfh
-- Allows an authenticated employee to record attendance as Work From Home.
-- Strictly validates caller identity via auth.uid(), prevents duplicate check-ins,
-- and records attendance_type = 'WORK_FROM_HOME' with pending approval status.
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

  -- Prevent contradictory or duplicate attendance for today
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

-- 4. RPC: review_wfh_attendance
-- Allows Admin or Owner to approve or reject a WFH request.
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

  -- Dispatch notification to the employee
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

-- 5. RPC: cancel_wfh
-- Allows an employee to cancel their pending WFH request for today.
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
