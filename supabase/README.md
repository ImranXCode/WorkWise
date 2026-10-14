# Database schema

`schema.sql` is the single, canonical source of truth for the database:
tables, RLS policies, helper functions, and the onboarding RPCs
(`create_organization`, `accept_invitation`, `invite_employee`).

The old `phase3_profiles.sql`, `phase3_backfill_and_fixes.sql`, and
`phase4_multitenant.sql` files have been deleted and folded into this one
file. Running three separate files at different times let the live
database drift from what was in the repo, which caused real bugs (e.g. an
older, unfixed version of `create_organization` being live in Supabase
while the repo already had the fixed version).

## Rule going forward

**Never edit the schema only in the Supabase SQL Editor.**

1. Make the change in `schema.sql` first.
2. Paste the whole file (or just the changed section, if you're confident)
   into the Supabase SQL Editor and run it.
3. Commit `schema.sql`.

The file is written to be safe to re-run top to bottom at any time --
every `create table` uses `if not exists`, every function uses
`create or replace`, and every policy/trigger is dropped and recreated.
If you're ever unsure whether the live database matches this file, just
re-run the whole thing; it won't break anything that's already correct.

## Verifying isolation after any change

After running `schema.sql`, check Supabase Dashboard -> Advisors ->
**Security Advisor**. It should show:

- **0 errors** (RLS disabled, or RLS enabled with no policies)
- **0 warnings** about "Public Can Execute SECURITY DEFINER Function" for
  `create_organization`, `accept_invitation`, `invite_employee`,
  `current_org_id`, `current_role`, `is_owner_or_admin`

If either regresses, something in a schema change removed the `revoke`/
`grant` lines at the bottom of the file -- re-run the whole file again.

## Manually resetting a test account

While developing, you'll often want to fully reset one test account so it
can create/join an organization again from scratch -- without deleting the
login itself:

```sql
delete from public.organizations
where created_by = (select id from auth.users where email = 'test@example.com');

delete from public.profiles
where email = 'test@example.com';
```

After this, the account can sign in and go through "Create workspace" or
"Join a company" again as if it were brand new.

## Fully deleting a test account (including the login)

As of the latest `schema.sql`, deleting a user from Dashboard ->
Authentication -> Users works directly, with no extra steps -- the
`organizations.created_by` and `invitations.invited_by` foreign keys are
now `on delete set null`, so Postgres no longer blocks it.

If you're removing someone from a company but want to keep their login
intact (the normal case -- an offboarded employee, or an admin correcting
a mistaken invite), use the in-app "Remove" button on the Employees page
instead, or call the RPC directly:

```sql
select public.remove_member('<their profile id>');
```

This only revokes their membership (deletes their `profiles` row); their
Supabase Auth login is untouched, and they'd need a new invite or to
create their own workspace to get back in.

## Telling organizations apart while testing

Every test session looks identical at a glance (same app, just different
data), which is what caused most of the confusion during early testing --
there was no way to tell, from the screen alone, which company a signed-in
session belonged to. The app now shows the organization's name and slug in
the sidebar, and the organization name plus the signed-in email in the top
header, on every dashboard page. The company-creation and invite-acceptance
screens also now show which email is currently signed in before you submit.
Check these before assuming which account/company you're looking at,
especially when testing with multiple accounts across multiple browser
windows.
