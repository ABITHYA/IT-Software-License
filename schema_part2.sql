-- Part 2: run AFTER schema.sql

-- Risk factors (1 = low ... 4 = very high) used by the risk calculator
alter table software
  add column if not exists data_sensitivity int check (data_sensitivity between 1 and 4),
  add column if not exists access_privilege int check (access_privilege between 1 and 4),
  add column if not exists business_criticality int check (business_criticality between 1 and 4),
  add column if not exists financial_impact int check (financial_impact between 1 and 4),
  add column if not exists external_access int check (external_access between 1 and 4),
  add column if not exists risk_score int;

-- Software + live license counts (total / available / assigned ...)
create or replace view software_inventory as
select
  s.*,
  count(l.id)::int                                            as total_licenses,
  (count(l.id) filter (where l.status = 'available'))::int    as available_licenses,
  (count(l.id) filter (where l.status = 'assigned'))::int     as assigned_licenses,
  (count(l.id) filter (where l.status = 'reserved'))::int     as reserved_licenses,
  (count(l.id) filter (where l.status = 'suspended'))::int    as suspended_licenses,
  (count(l.id) filter (where l.status = 'expired'))::int      as expired_licenses
from software s
left join licenses l on l.software_id = s.id
group by s.id;

create index if not exists idx_requests_software_status on access_requests (software_id, status);
create index if not exists idx_assignments_active_user on license_assignments (user_id) where revoked_at is null;
