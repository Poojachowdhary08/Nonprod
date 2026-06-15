# Role Access Guide

## Purpose

This document explains:

- which role tables the app uses
- what each role currently sees in the mobile app
- what the older `HomeScreen` behavior was before the centralized role update
- how to add, replace, remove, and inspect roles in PostgreSQL using pgAdmin
- what regression was fixed for admin access

This guide is based on the current code in:

- `backend/auth/role_store.py`
- `app/HomeScreen.tsx`

## Main Tables

### `public.app_roles`

This is the central role catalog.

It stores:

- `role_key`
- `role_label`
- `description`
- `is_active`
- `web_enabled`
- `mobile_enabled`
- `sort_order`

You usually do not edit this table for normal user testing unless you are adding a brand-new role definition.

### `public.employee_role_assignments`

This is the main table used to assign roles to users.

It stores:

- `employee_code`
- `role_key`
- `created_at`

This is the table you should update when testing role-based access.

### `public.employees`

This contains employee master data such as:

- `employee_code`
- `job_title`
- `phone_number`

This table still matters for identity and some defaults, but current access control is driven by `public.employee_role_assignments`.

## Supported Role Keys

Current managed role keys from `backend/auth/role_store.py`:

- `ADMIN`
- `SUPER_ADMIN`
- `STOCK_MANAGEMENT_TEAM`
- `BACKEND_TEAM`
- `FINANCE_TEAM`
- `SALES_TEAM`
- `PROCUREMENT_TEAM`
- `SITE_ENGINEER`
- `SUPPORT_STAFF`

## Current Mobile Access

This section describes current `HomeScreen` behavior.

### `ADMIN`

- full dashboard access
- bottom tabs: `Properties`, `Tasks`, `Stock`, `Requested`
- admin also has stock access, but is not stock-only

### `SUPER_ADMIN`

- same mobile behavior as admin
- bottom tabs: `Properties`, `Tasks`, `Stock`, `Requested`

### `BACKEND_TEAM`

- full dashboard access
- bottom tabs: `Properties`, `Tasks`, `Stock`, `Requested`

### `STOCK_MANAGEMENT_TEAM`

- stock-only home
- bottom tabs: `Stock`, `Requests`
- default screen opens stock inventory

### `PROCUREMENT_TEAM`

- stock-only home
- bottom tabs: `Stock`, `Requests`
- default screen opens stock inventory

### `SALES_TEAM`

- redirected to `SalesDashboard`
- bottom tabs there: `Dashboard`, `Leads`, `Clients`

### `SITE_ENGINEER`

- field/basic dashboard
- bottom tabs: `Properties`, `Tasks`

### `SUPPORT_STAFF`

- field/basic dashboard
- bottom tabs: `Properties`, `Tasks`

### `FINANCE_TEAM`

- no special `HomeScreen` branch right now
- falls through to default dashboard
- bottom tabs: `Properties`, `Tasks`

### Unknown or unhandled role

- default dashboard
- bottom tabs: `Properties`, `Tasks`

## Older Mobile Access Behavior

Before the centralized role handling in `HomeScreen`, behavior was more limited and depended mainly on `job_title`.

### Older behavior summary

- `ADMIN` was effectively treated like backend engineer access
- backend engineer style users got dashboard access
- `STOCK_MANAGEMENT_TEAM` equivalent users got stock-only access
- `SALES_TEAM` users were redirected to sales dashboard
- `SITE_ENGINEER` got `Properties` and `Tasks`
- `PROCUREMENT_TEAM`, `SUPPORT_STAFF`, `SUPER_ADMIN`, and `FINANCE_TEAM` did not have clear dedicated handling in the old `HomeScreen` logic

## What Changed

We moved `HomeScreen` to centralized role checking using the `roles` array returned from the backend instead of relying only on `job_title`.

That improved support for:

- `SUPER_ADMIN`
- `PROCUREMENT_TEAM`
- `SUPPORT_STAFF`
- multiple roles on one employee

## Admin Regression That Was Fixed

During the role centralization update, `ADMIN` was accidentally included in the stock-only branch.

That caused admin users to see only:

- `Stock`
- `Requests`

instead of the full dashboard.

The fix was:

- keep admin stock access
- but do not treat admin as stock-only
- only `STOCK_MANAGEMENT_TEAM` and `PROCUREMENT_TEAM` should use the stock-only home layout

## Safe Testing Approach

Do not update all users in the database.

Use one test employee and change only that employee's role assignment.

Recommended flow:

1. choose one test `employee_code`
2. check existing assigned roles
3. replace with one role
4. log out and log back in
5. verify the UI
6. restore the original role if needed

## SQL: Inspect Roles

### Show all available role keys

```sql
SELECT role_key, role_label, description, is_active, web_enabled, mobile_enabled, sort_order
FROM public.app_roles
ORDER BY sort_order, role_key;
```

### Show roles for one employee

```sql
SELECT *
FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004'
ORDER BY role_key;
```

### Show employee master row

```sql
SELECT employee_code, first_name, last_name, phone_number, job_title
FROM public.employees
WHERE employee_code = 'EMP_CON_004';
```

## SQL: Replace a User's Roles

This is the safest pattern for testing one role at a time.

### Replace with `ADMIN`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'ADMIN');

COMMIT;
```

### Replace with `BACKEND_TEAM`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'BACKEND_TEAM');

COMMIT;
```

### Replace with `STOCK_MANAGEMENT_TEAM`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'STOCK_MANAGEMENT_TEAM');

COMMIT;
```

### Replace with `PROCUREMENT_TEAM`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'PROCUREMENT_TEAM');

COMMIT;
```

### Replace with `SITE_ENGINEER`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'SITE_ENGINEER');

COMMIT;
```

### Replace with `SUPPORT_STAFF`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'SUPPORT_STAFF');

COMMIT;
```

### Replace with `SALES_TEAM`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'SALES_TEAM');

COMMIT;
```

### Replace with `FINANCE_TEAM`

```sql
BEGIN;

DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';

INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'FINANCE_TEAM');

COMMIT;
```

## SQL: Add an Extra Role Without Deleting Existing Ones

Use this when you want a user to have multiple roles.

```sql
INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES ('EMP_CON_004', 'ADMIN')
ON CONFLICT (employee_code, role_key) DO NOTHING;
```

Example for two roles:

```sql
INSERT INTO public.employee_role_assignments (employee_code, role_key)
VALUES
  ('EMP_CON_004', 'ADMIN'),
  ('EMP_CON_004', 'BACKEND_TEAM')
ON CONFLICT (employee_code, role_key) DO NOTHING;
```

## SQL: Delete One Role From One User

```sql
DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004'
  AND role_key = 'ADMIN';
```

## SQL: Delete All Roles From One User

```sql
DELETE FROM public.employee_role_assignments
WHERE employee_code = 'EMP_CON_004';
```

If you do this, the app may fall back to default handling depending on the user and screen.

## SQL: Restore Based on Job Title Default

If you want to restore a user manually using current default conventions, use the role that matches the employee's `job_title`.

Examples:

- `Admin` -> `ADMIN`
- `Stock Manager` -> `STOCK_MANAGEMENT_TEAM`
- `Procurement` -> `PROCUREMENT_TEAM`
- `Sales Team` -> `SALES_TEAM`
- `Backend Engineer` -> `BACKEND_TEAM`
- `Site Engineer` -> `SITE_ENGINEER`
- `Support Staff` -> `SUPPORT_STAFF`
- `Finance` or `Accounts` -> `FINANCE_TEAM`

## SQL: Add a Brand-New Role to the Catalog

Only do this if the code is also updated to understand the new role.

```sql
INSERT INTO public.app_roles (
  role_key,
  role_label,
  description,
  is_active,
  web_enabled,
  mobile_enabled,
  sort_order
)
VALUES (
  'NEW_ROLE_KEY',
  'New Role Label',
  'Describe what this role is for.',
  TRUE,
  TRUE,
  TRUE,
  100
)
ON CONFLICT (role_key) DO UPDATE
SET
  role_label = EXCLUDED.role_label,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  web_enabled = EXCLUDED.web_enabled,
  mobile_enabled = EXCLUDED.mobile_enabled,
  sort_order = EXCLUDED.sort_order;
```

Important:

- adding a row in `public.app_roles` alone does not give the app new behavior
- frontend and backend logic must also be updated to recognize that new role

## Quick Test Matrix

### `ADMIN`

- expected home tabs: `Properties`, `Tasks`, `Stock`, `Requested`

### `SUPER_ADMIN`

- expected home tabs: `Properties`, `Tasks`, `Stock`, `Requested`

### `BACKEND_TEAM`

- expected home tabs: `Properties`, `Tasks`, `Stock`, `Requested`

### `STOCK_MANAGEMENT_TEAM`

- expected home tabs: `Stock`, `Requests`

### `PROCUREMENT_TEAM`

- expected home tabs: `Stock`, `Requests`

### `SITE_ENGINEER`

- expected home tabs: `Properties`, `Tasks`

### `SUPPORT_STAFF`

- expected home tabs: `Properties`, `Tasks`

### `SALES_TEAM`

- expected route: `SalesDashboard`

### `FINANCE_TEAM`

- expected home tabs: `Properties`, `Tasks`

## Notes

- after changing roles, log out and log back in
- if the old role still appears, clear local session/cache and reload
- for clean testing, change only one test employee at a time
- use uppercase `role_key` values exactly as stored in `public.app_roles`
