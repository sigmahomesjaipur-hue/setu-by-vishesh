# Setu · Sigma Homes India

Setu is a polished, responsive attendance-management prototype for Sigma Homes India. It is intentionally a dependency-free static app so it can be opened locally without a backend or package installation.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python -m http.server 4173
```

Then visit <http://localhost:4173>. Use the Employee/Admin switch on the welcome screen. Credentials must be created or managed by an administrator in **User management**; the login form is intentionally empty and does not publish trial credentials. Employee and admin flows include local in-memory interactions for check-in/check-out, task completion, navigation, settings, and task assignment. Browser geolocation is available on `localhost` or an HTTPS deployment; opening the file directly may be blocked by browser security rules.

## Deploy free with the Vercel dashboard

This repository is already a static deployable root: `index.html`, `app.js`, and `styles.css` are at the project root. No build step, package install, CLI login, environment variable, or deployment credential is required.

1. Sign in to Vercel at <https://vercel.com> and choose **Add New… → Project**.
2. Choose **Import** for the connected Git repository, or use **Upload** and upload this project folder.
3. Set **Root Directory** to the folder containing `index.html` (`D:\Website` locally; the repository root when imported).
4. Set **Framework Preset** to **Other**.
5. Leave **Build Command** empty (or choose **Override** and leave it blank).
6. Leave **Output Directory** empty; do not set `dist`, `build`, or `public`.
7. Leave **Install Command** empty/not applicable, then choose **Deploy**.

The included `vercel.json` only adds safe static response headers, including `Permissions-Policy: geolocation=(self)`; it does not add a backend or change the static entry point. Deployment was not performed from this workspace.

After deployment, use the generated `https://*.vercel.app` URL. Browser location permission requires HTTPS (localhost is also allowed during local development); users must explicitly allow location for the deployed origin. Geolocation can still be unavailable or inaccurate on a device, and the prototype keeps location, users, sites, leave requests, and salary settings in browser storage/in-memory state rather than a server database. A Vercel URL does not make prototype authentication, attendance, payroll, or client-side geofence checks production-secure.

Admin Attendance includes a selectable employee roster, profile/contact and compensation summary, monthly attendance statistics, month navigation, a seven-day-workweek status calendar, selected-day check-in/out and leave details, and a print-ready personal monthly sheet. Use **Print monthly sheet** to open the browser print dialog or save a PDF. Saturday and Sunday are normal scheduled workdays; absent status applies after the configured daily cutoff if no check-in or approved leave exists.

Employees can use **Apply for leave** to submit a locally persisted pending request with type, dates, and reason. Admins review pending requests in Attendance and approve or reject them; approved dates flow into the employee/admin calendars, counts, daily details, and monthly print sheet. Past scheduled days (including Saturdays and Sundays) with no check-in and no approved leave are derived as **Absent**; today remains open until the daily cutoff and future dates show no record. Browser local storage is used for the prototype request queue.

Admin **Workspace settings** includes a persisted **Site locations** manager and a configurable **Daily attendance cutoff**. The cutoff controls both the latest permitted employee check-in and when a no-check-in day is marked Absent. It saves to Supabase in shared mode or browser storage locally and refreshes across tabs/devices when the updated schema's Realtime publication is enabled. The launch baseline starts with no sites or employees; admins can add, edit, select, and delete sites, enter latitude/longitude/radius manually, or use **Use my current location**. Employee check-in captures the device location once, finds the nearest enabled configured site, and uses that site’s name and radius for the geofence. Employee accounts do not need a site assignment. Location permission is only requested for an explicit site-coordinate lookup or the employee’s check-in/check-out capture; location is not tracked continuously and site coordinates are local prototype data.

The clean launch admin account is `admin@sigmahome.in` with password `sigma@2026`. The one-time `setuLaunchReset2026` browser reset removes prototype records from local storage; create sites and employee accounts before using employee workflows.

Leave balances are stored per account. The Admin command centre shows the signed-in admin’s own balance, while employee balances remain editable in **User management**; in Supabase mode the edit updates `profiles.leave_balance`, and in local mode it is saved to browser storage. Approving a pending employee request deducts its inclusive number of leave days once, and approval is blocked when the employee balance is insufficient. Employee and admin tabs sync balance and request changes through browser storage events.

Hosted leave-balance edits call the admin-checked `admin_set_leave_balance(uuid, integer)` database function and require the latest `supabase-schema.sql` to be applied. The function only updates a matching employee profile and returns the saved balance; missing profile IDs produce an explicit error.

Admin **User management** provides local create/edit, role, department/site, active/inactive, password reset/change, visibility toggles, activation/deactivation, and confirmed deletion. Usernames must be unique, passwords are never listed, and the last active admin cannot be removed or deactivated. Login checks the locally managed account and role rather than accepting arbitrary credentials. For a fresh environment, use the administrator-managed account data already present in local storage or create accounts through the admin flow; this documentation intentionally does not publish passwords. This is prototype-only credential storage: production must use server-side authentication, strong password hashing (never plaintext), secure sessions/tokens, RBAC authorization on every API, audit logs, rate limiting/lockouts, password recovery, and secure credential transport.

For hosted Supabase user creation, deploy the Edge Function before using **Add user**:

```powershell
cd D:\Website
supabase login
supabase link --project-ref dtbruclopivjyfskcmjo
supabase functions deploy create-user
supabase functions deploy delete-user
```

The current project URL is set in `supabase-config.js`. Paste the matching project's **publishable anon key** into that file before hosted features can connect; while the key is blank, the app safely remains in local mode. The signed-in admin must also have a matching `profiles` row with `role = 'admin'` and `status = 'Active'`; new passwords must be at least 8 characters. The functions use Supabase's server-side service role automatically and validate the caller's bearer token/admin profile in the handler (`verify_jwt = false` is set so browser CORS preflight can reach the handler). Never put the service-role key in frontend config. If creation fails, inspect **Supabase → Edge Functions → create-user → Logs**; the Setu form surfaces function responses and deployment/auth guidance.

If the Edge Function says only an active admin can create/delete users, open **Authentication → Users** and copy the signed-in admin's User UID. In SQL Editor, run this diagnostic (replace the email):

```sql
select u.id, u.email, p.role, p.status
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('your-admin-email@example.com');
```

The result must contain one profile row with the same UID, `role = 'admin'`, and `status = 'Active'`. If the row exists with different role/status casing or value, correct it using that Auth UID. If it is missing, create the profile row linked to that UID; never create a different UUID for the profile. The updated functions now report which condition failed and include the Auth UID when the profile is missing. Redeploy after updating function source:

```powershell
supabase functions deploy create-user --project-ref dtbruclopivjyfskcmjo
supabase functions deploy delete-user --project-ref dtbruclopivjyfskcmjo
```

Redeploy these functions after source changes. Their CORS preflight explicitly allows the Supabase client `x-supabase-api-version` header required by browser invocations.

When Supabase is configured, user deletion is performed through the `delete-user` Edge Function so the Auth account and cascading profile/attendance data are removed together. The function clears nullable leave-review references before deleting an account and prevents removal of the last active admin. After updating it, redeploy with `supabase functions deploy delete-user --project-ref <your-project-ref>`. Existing accounts deleted directly in the UI before that function was deployed may still exist in Supabase Authentication or `profiles`; remove those records from the Supabase dashboard/SQL Editor once, then use the synchronized delete action going forward. Delete errors now display the function response; inspect Supabase Edge Function logs for any remaining server/database error.

In Supabase mode, the User management list is rebuilt from `profiles` instead of merging stale browser-local prototype accounts. Only UUID-backed Auth profiles can be deleted remotely; old local-only rows are blocked from being sent to the Auth Admin API.

Employee rows in User management include an admin-only **Performance** workspace. It supports employee/month selection, attendance and punctuality metrics, working-hour averages, task completion summary, recent activity, editable base salary/expected working days/overtime inputs, INR payable/earned/deduction/final estimates, local salary persistence, and a print/save-PDF monthly performance and salary statement. Estimates are prototype-only and exclude statutory deductions, tax, benefits, and server-approved payroll inputs.

## Shared production backend

The static prototype uses browser storage by default. To make data shared between devices, create a Supabase project, run `supabase-schema.sql` in its SQL Editor, create the first account in **Authentication → Users**, and copy the project URL and publishable anon key into `supabase-config.js`. Never use a `service_role` key in the browser.

Then deploy `index.html`, `app.js`, `styles.css`, `supabase-config.js`, and `supabase-schema.sql` to Vercel. The schema enables Row Level Security, separates admin/employee access, enables Realtime tables, and provides the transactional `approve_leave(request_id)` function so an approved request deducts leave exactly once. The current UI remains in local-prototype mode until its data reads/writes are migrated to the Supabase tables; do not treat the local mode as production storage.

The Admin **Add user** form now calls `supabase/functions/create-user`, which creates the Auth account and profile securely. Install the Supabase CLI, link the project, and deploy the function:

```powershell
supabase login
cd D:\Website
supabase link --project-ref dtbruclopivjyfskcmjo
supabase functions deploy create-user
supabase functions deploy delete-user
```

The function uses the platform-provided `SUPABASE_SERVICE_ROLE_KEY` only on the server. Do not put that key in `supabase-config.js`. After deployment, the Admin panel can create shared employee/admin logins directly. The existing UI still has local prototype data for non-auth resources until those reads/writes are migrated to Supabase tables.

If the existing database was created before profile emails were added, run this one-time migration in Supabase SQL Editor before deploying a newer `create-user` function:

```sql
alter table public.profiles add column if not exists email text;
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;
```

The `workspace_settings` table stores the shared legacy radius and administrator-controlled daily cutoff. The `attendance` table stores Supabase-mode check-in/check-out timestamps and captured coordinates; the updated schema also publishes workspace settings to Realtime. Apply the latest `supabase-schema.sql` once before using shared Admin settings or cutoff synchronization.

## Prototype boundaries

Authentication, payroll calculations, and persistence are mocked in local fallback mode. Password login is used; the prototype OTP login has been removed. The employee dashboard captures location only when the employee clicks **Check in** or **Check out**; it uses `navigator.geolocation.getCurrentPosition` for a single fresh fix and never starts live tracking or a location watch. The browser may show a permission prompt for each action; users can revoke access in browser settings. Captured coordinates are stored in Supabase when shared mode is configured. If the API is unavailable, the action is rejected with an explicit error.

Check-in is gated on a fresh position captured at the action time, being inside the employee’s assigned-site radius, and the configured cutoff time. The browser-reported accuracy is displayed for context but does not block an in-radius check-in, since consumer GPS accuracy can be wider than a configured site radius even when the measured position is at the site. These client-side checks are UX safeguards only and must not be treated as attendance proof.

Attendance records refresh from the shared attendance table (or local prototype storage) while the app is open. Admins control one daily attendance cutoff in **Workspace settings**; it is saved to Supabase in shared mode or browser storage locally. The employee check-in button is blocked after that time, and a day with no check-in becomes **Absent** at that same cutoff. A recorded check-in is immediately shown as **Present**; a completed shift under six hours is shown as **Half-day**. Every calendar day is a scheduled workday, including Saturday and Sunday. These classifications are prototype display rules and should be recomputed and audited server-side for production payroll.

Background attendance/settings refreshes preserve values and focus in any form currently being edited, including leave and user-management forms, so periodic synchronization does not discard an in-progress entry.

## Production roadmap

1. Add a Vite React + TypeScript shell and a proper API/service layer.
2. Use an identity provider (OIDC/SAML) with role-based access control and secure sessions.
3. Capture browser GPS with explicit consent over HTTPS, validate coordinates server-side against office geofences (never trust client distance/cutoff checks), and record accuracy, overrides, consent, and audit events.
4. Persist attendance, leave, tasks, and employee data in a relational database with migrations and backups.
5. Integrate payroll/HRIS, statutory deductions, approvals, exports, and immutable payroll audit logs.
6. Add automated unit, accessibility, integration, and end-to-end tests plus observability and retention controls.
