-- IT Software License & Access Lifecycle Manager
-- Run in the Supabase SQL editor (or as a migration).

-- ============ ENUMS ============
create type user_role as enum ('employee','manager','it_admin','security_admin','super_admin');
create type risk_level as enum ('low','medium','high','critical');
create type license_status as enum ('available','reserved','assigned','suspended','expired','revoked');
create type request_status as enum (
  'draft','pending_manager','manager_approved','manager_rejected',
  'pending_it','it_approved','it_rejected',
  'pending_security','security_rejected',
  'waiting_for_license','license_assigned','active',
  'expired','revoked','cancelled'
);
create type approval_stage as enum ('manager','it','security');
create type approval_decision as enum ('pending','approved','rejected');
create type priority_level as enum ('low','medium','high','urgent');

-- ============ CORE TABLES ============
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  employee_id text unique,
  department_id uuid references departments(id),
  role user_role not null default 'employee',
  job_title text,
  manager_id uuid references profiles(id),
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table software (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code_prefix text not null unique,            -- e.g. FIG -> FIG-001
  vendor text,
  description text,
  category text,
  version text,
  license_type text,                           -- subscription / perpetual / seat
  risk_level risk_level not null default 'low',
  cost_per_license numeric(12,2) default 0,
  billing_cycle text default 'monthly',
  renewal_date date,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table software_access_levels (
  id uuid primary key default gen_random_uuid(),
  software_id uuid not null references software(id) on delete cascade,
  name text not null,
  unique (software_id, name)
);

create table software_departments (          -- department availability
  software_id uuid references software(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,
  primary key (software_id, department_id)
);

create table licenses (
  id uuid primary key default gen_random_uuid(),
  license_code text not null unique,           -- FIG-001
  software_id uuid not null references software(id) on delete cascade,
  license_key text,
  status license_status not null default 'available',
  purchase_date date,
  expiry_date date,
  cost numeric(12,2),
  created_at timestamptz default now()
);
create index on licenses (software_id, status);

-- ============ POLICY (data-driven approval chain) ============
create table approval_policies (
  risk risk_level primary key,
  stages approval_stage[] not null
);
insert into approval_policies values
  ('low',      '{manager,it}'),
  ('medium',   '{manager,it}'),
  ('high',     '{manager,it,security}'),
  ('critical', '{manager,it,security}');

-- ============ REQUESTS ============
create sequence request_no_seq start 1001;

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text unique not null default ('REQ-' || nextval('request_no_seq')),
  requester_id uuid not null references profiles(id),
  software_id uuid not null references software(id),
  access_level_id uuid references software_access_levels(id),
  justification text not null,
  priority priority_level not null default 'medium',
  project text,
  department_id uuid references departments(id),
  start_date date,
  end_date date,
  is_emergency boolean not null default false,
  risk risk_level not null,                    -- snapshot at request time
  status request_status not null default 'pending_manager',
  comments text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index on access_requests (requester_id);
create index on access_requests (status);

create table request_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references access_requests(id) on delete cascade,
  stage approval_stage not null,
  seq int not null,                            -- order in chain
  approver_id uuid references profiles(id),
  decision approval_decision not null default 'pending',
  comments text,
  decided_at timestamptz,
  unique (request_id, stage)
);

-- ============ ASSIGNMENT HISTORY ============
create table license_assignments (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references licenses(id),
  user_id uuid not null references profiles(id),
  request_id uuid references access_requests(id),
  assigned_by uuid references profiles(id),
  assigned_at timestamptz default now(),
  expires_at date,
  last_activity_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);
create index on license_assignments (user_id);
create unique index one_active_assignment_per_license
  on license_assignments (license_id) where revoked_at is null;

-- ============ PACKAGES ============
create table access_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);
create table access_package_items (
  package_id uuid references access_packages(id) on delete cascade,
  software_id uuid references software(id) on delete cascade,
  access_level_id uuid references software_access_levels(id),
  primary key (package_id, software_id)
);

-- ============ NOTIFICATIONS & AUDIT ============
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id),
  action text not null,                        -- e.g. license_assigned
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz default now()
);

-- ============ HELPERS ============
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function is_admin() returns boolean
language sql stable as
$$ select auth_role() in ('it_admin','super_admin') $$;

create or replace function is_manager_of(uid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = uid and manager_id = auth.uid()) $$;

-- Auto-create profile on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Build approval chain when a request is created
create or replace function create_approval_chain() returns trigger
language plpgsql security definer set search_path = public as $$
declare s approval_stage; i int := 1;
begin
  for s in select unnest(stages) from approval_policies where risk = new.risk loop
    insert into request_approvals (request_id, stage, seq) values (new.id, s, i);
    i := i + 1;
  end loop;
  return new;
end $$;
create trigger trg_approval_chain after insert on access_requests
  for each row execute function create_approval_chain();

-- Assign an available license (row-locked so two requests can't take the same one)
create or replace function assign_license(p_request uuid, p_actor uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r access_requests; l licenses;
begin
  select * into r from access_requests where id = p_request for update;

  select * into l from licenses
   where software_id = r.software_id and status = 'available'
     and (expiry_date is null or expiry_date > current_date)
   order by license_code
   limit 1 for update skip locked;

  if not found then
    update access_requests set status = 'waiting_for_license', updated_at = now() where id = p_request;
    insert into audit_logs (actor_id, action, entity_type, entity_id)
      values (p_actor, 'request_waitlisted', 'access_request', p_request::text);
    return 'waitlisted';
  end if;

  update licenses set status = 'assigned' where id = l.id;
  insert into license_assignments (license_id, user_id, request_id, assigned_by, expires_at)
    values (l.id, r.requester_id, r.id, p_actor, r.end_date);
  update access_requests set status = 'active', updated_at = now() where id = p_request;
  insert into notifications (user_id, message, link)
    values (r.requester_id, 'Your ' || r.request_no || ' request is active. License ' || l.license_code || ' assigned.', '/my-licenses');
  insert into audit_logs (actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'license_assigned', 'license', l.id::text,
            jsonb_build_object('license', l.license_code, 'user', r.requester_id, 'request', r.request_no));
  return l.license_code;
end $$;

-- Revoke and release back to the pool (then re-run waitlist from the app/cron)
create or replace function revoke_license(p_assignment uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a license_assignments;
begin
  select * into a from license_assignments where id = p_assignment and revoked_at is null for update;
  if not found then raise exception 'Assignment not found or already revoked'; end if;
  update license_assignments set revoked_at = now(), revoke_reason = p_reason where id = a.id;
  update licenses set status = 'available' where id = a.license_id;
  update access_requests set status = 'revoked', updated_at = now() where id = a.request_id;
  insert into notifications (user_id, message) values (a.user_id, 'Your license access has been revoked: ' || p_reason);
  insert into audit_logs (actor_id, action, entity_type, entity_id, details)
    values (p_actor, 'license_revoked', 'license', a.license_id::text, jsonb_build_object('reason', p_reason));
end $$;

-- ============ ROW LEVEL SECURITY ============
alter table departments enable row level security;
alter table profiles enable row level security;
alter table software enable row level security;
alter table software_access_levels enable row level security;
alter table licenses enable row level security;
alter table access_requests enable row level security;
alter table request_approvals enable row level security;
alter table license_assignments enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- Reference data: readable by any logged-in user, writable by admins
create policy dept_read on departments for select to authenticated using (true);
create policy dept_write on departments for all to authenticated using (is_admin()) with check (is_admin());
create policy sw_read on software for select to authenticated using (true);
create policy sw_write on software for all to authenticated using (is_admin()) with check (is_admin());
create policy lvl_read on software_access_levels for select to authenticated using (true);
create policy lvl_write on software_access_levels for all to authenticated using (is_admin()) with check (is_admin());

-- Profiles
create policy prof_self on profiles for select to authenticated
  using (id = auth.uid() or manager_id = auth.uid() or is_admin());
create policy prof_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = auth_role()); -- cannot self-promote
create policy prof_admin on profiles for all to authenticated using (is_admin()) with check (is_admin());

-- Licenses: admins only (employees see theirs through assignments)
create policy lic_admin on licenses for all to authenticated using (is_admin()) with check (is_admin());

-- Requests
create policy req_insert on access_requests for insert to authenticated with check (requester_id = auth.uid());
create policy req_select on access_requests for select to authenticated
  using (requester_id = auth.uid() or is_manager_of(requester_id) or is_admin()
         or auth_role() = 'security_admin');
create policy req_cancel on access_requests for update to authenticated
  using (requester_id = auth.uid() and status in ('draft','pending_manager'))
  with check (requester_id = auth.uid());
create policy req_admin on access_requests for update to authenticated using (is_admin());

create policy appr_select on request_approvals for select to authenticated
  using (exists (select 1 from access_requests r where r.id = request_id
         and (r.requester_id = auth.uid() or is_manager_of(r.requester_id) or is_admin()
              or auth_role() = 'security_admin')));
-- Approval decisions go through the Express API (service role) so the chain order is enforced server-side.

create policy asg_select on license_assignments for select to authenticated
  using (user_id = auth.uid() or is_manager_of(user_id) or is_admin());

create policy notif_own on notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_read on audit_logs for select to authenticated
  using (auth_role() in ('it_admin','super_admin'));

-- ============ SEED ============
insert into departments (name) values
  ('Engineering'),('Design'),('HR'),('Finance'),('Marketing'),('IT'),('Sales');
