# Super Admin Provisioning — Design

Date: 2 September 2026
Status: awaiting review

## 1. Motivation

The app currently ships with fully self-service tenant creation: any anonymous visitor can hit `POST /api/auth/register` (`app/api/auth/register/route.ts:13-99`) and, in one transaction, create a `User`, a brand-new `Organization`, and a `Membership` with `role: "OWNER"` — no vetting, no approval. A logged-in user can also spin up additional organizations unassisted via `POST /api/organizations` (`app/api/organizations/route.ts:12-83`).

This was flagged as a problem for two reasons the product owner confirmed on 2 Sept 2026:

1. **Fraud/quality risk** — anonymous signup immediately grants the ability to publish a public exhibition and collect real customer bookings, with no accountability step.
2. **No billing checkpoint** — tenant-wise monetization (a later, separate piece of work) needs a natural gate where a tenant's plan/payment gets attached before they go live. Self-service signup has no such gate.

Decision: **remove self-service organization/account creation entirely.** A new platform-level `Super Admin` role becomes the only way a new `Organization` and its first admin user come into existence. Everything else in the existing per-organization RBAC model (`OWNER, ORGANIZER_ADMIN, ORGANIZER_STAFF, MAP_EDITOR, FINANCE` — `types/domain.ts:1-9`) is unchanged: an org's own `OWNER`/`ORGANIZER_ADMIN` still invites their own teammates into that org, same as today.

**Explicitly out of scope:** tenant billing/subscription/plan-tiers. This spec only builds the provisioning mechanism; billing is a separate follow-up spec once this lands.

## 2. Current State (read from code)

- No global/platform role exists anywhere. `UserDocument` (`models/auth.ts:8-16`) is a pure identity record (`email, name, status, passwordHash, createdAt, updatedAt`) with no role field; every role lives on `MembershipDocument` (`models/auth.ts:27-36`), scoped to one `organizationId`.
- No `middleware.ts` exists; `proxy.ts` only handles visitor cookies, rate limiting, and security headers — zero auth/role gating happens there. All authorization is inside route handlers via `lib/auth/authorization.ts`.
- Sessions are opaque DB-backed tokens (`lib/auth/session.ts`) — the cookie carries only a random token, no embedded role/org data. `getCurrentUser()` does a fresh `UserDocument` lookup on every request. **Implication: adding a platform-admin flag needs no session/cookie shape change.**
- An invitation mechanism already exists (`InvitationDocument`, `models/auth.ts:47-57`) but only serves org-admin-invites-teammate, and only when the invitee already has an account: `app/api/auth/invitations/accept/route.ts:14` requires `getCurrentUser()` before it will attach a membership. There is no path today for "invite someone who has no account yet."
- An email queue already exists and is reusable: `lib/email/index.ts` (`queueEmail` writes an `EmailEventDocument`; `sendQueuedEmail` ships it via Resend; a cron-style job at `app/api/internal/jobs/process-emails/route.ts` drains the queue). Today it's only used for `booking-confirmation`, and the HTML body is a generic hardcoded string with no room for a link — this needs a small extension (§3.5).

## 3. Architecture

### 3.1 Data model changes

```
UserDocument         + isPlatformAdmin: boolean   (default false)
InvitationDocument   + invitedByPlatform: boolean (true when a Super Admin issued it while
                                                     provisioning a new org; false for an
                                                     ordinary org-admin → teammate invite)
EmailEventDocument   + data?: Record<string, string>  (template-specific values, e.g. acceptUrl)
```

No other schema changes. `OrganizationDocument.status` (`ACTIVE | SUSPENDED`) already covers suspend/reactivate — reused as-is, no new field needed.

### 3.2 Authorization guard

New `lib/auth/platform.ts`:

```ts
export async function requirePlatformAdmin(): Promise<UserDocument> {
  const user = await getCurrentUser();
  if (!user || !user.isPlatformAdmin) throw new ForbiddenError(); // → 403 JSON
  return user;
}
```

Mirrors the existing `requireApiPermission` pattern but is organization-independent. Every route under `app/api/admin/**` and every page under `app/admin/**` calls this first. Unlike `resolveOrganizationContext` (which returns 404 to avoid confirming a specific org exists), platform routes return 403 — there's no per-resource ambiguity to protect, just "you are not a platform admin."

### 3.3 Provisioning flow (Super Admin creates a tenant)

`POST /api/admin/organizations` (`requirePlatformAdmin` gated):

1. Validate `{ name, slug, adminName, adminEmail }`.
2. Transaction: create `OrganizationDocument` (`status: "ACTIVE"`, no membership yet) → create `InvitationDocument` (`role: "OWNER"`, `organizationId`, `email: adminEmail`, `invitedByPlatform: true`, `invitedBy: <super admin's userId>`, 7-day expiry) → audit log entry.
3. `queueEmail(db, { recipient: adminEmail, template: "platform-org-invite", organizationId, data: { acceptUrl, orgName: name } })`.
4. Return the created org (201).

`GET /api/admin/organizations` — lists all tenants (name, slug, status, owner email if resolved, member count, createdAt) for the admin dashboard.

`PATCH /api/admin/organizations/[organizationId]` — toggles `status` between `ACTIVE`/`SUSPENDED`. Reuses the existing status field; no new suspend mechanism needed.

### 3.4 Generalized invitation-accept flow

Today's accept flow only knows "invitee already has an account." Extend `app/api/auth/invitations/accept/route.ts` to branch on whether a `UserDocument` exists for the invitation's email:

- **Account exists:** unchanged behavior — if the caller is logged in as that email, attach the `Membership` and mark `acceptedAt`.
- **No account exists:** new branch. The accept page collects a password (name comes from the invitation/provisioning input). Transaction: create `UserDocument` (`status: "ACTIVE"`, hashed password) → create `Membership` (role from the invitation) → mark `acceptedAt` → `createSession(userId)` → redirect to `/dashboard`.

This single mechanism now serves **both** cases without new plumbing:
- Super Admin provisions a new org → invitee has no account → creates account + becomes `OWNER`.
- An existing `OWNER`/`ORGANIZER_ADMIN` invites a teammate (today's flow, unchanged) → if that teammate has no account either (now the norm, since self-signup is gone), same "no account exists" branch fires — one code path instead of two.
- An existing `OWNER` wants a second org: Super Admin provisions it with that same email → accept flow recognizes the existing account and just attaches the new `Membership`, no new password.

### 3.5 Email extension

`sendQueuedEmail` currently renders `<p>Your ${email.template} event has been recorded.</p>` for every template — fine for `booking-confirmation`, useless for an invite that needs a clickable link. Add a small per-template body map (or a `data.acceptUrl` interpolation) so `platform-org-invite` and the existing invitation-email path render an actual "Accept invitation" link. This is a targeted fix to existing code, not a new subsystem.

### 3.6 Removed / gated routes

- **Delete** `app/api/auth/register/route.ts` and `app/(auth)/register/page.tsx`. Any "sign up" link on `/login` is removed; replace with a short note ("New organization? Contact your platform administrator.").
- **Delete** the `POST` handler in `app/api/organizations/route.ts` (self-serve "create another org" for a logged-in user). `GET` (list the caller's own orgs) stays.

### 3.7 Bootstrap (first Super Admin)

No signup path exists to create the very first Super Admin. `scripts/create-super-admin.ts`, run manually once via `npm run create-super-admin -- --email=... --name=... --password=...`: connects to Mongo directly, hashes the password, inserts a `UserDocument{ isPlatformAdmin: true, status: "ACTIVE" }`. Requires server/terminal access — never exposed over HTTP. Additional Super Admins afterward can be created by an existing one through a small `PATCH` on a user record (`isPlatformAdmin: true`) from the admin UI, or by re-running the script.

### 3.8 Admin UI

- `app/admin/layout.tsx` — gated by `requirePlatformAdmin`; visually distinct sidebar from the org-scoped `app/dashboard` shell so it's never confused with a tenant's own admin view.
- `app/admin/organizations/page.tsx` — table of all tenants: name, status, owner, member count, created date; "New Organization" action.
- `app/admin/organizations/new/page.tsx` — form (org name/slug + first admin name/email) → `POST /api/admin/organizations`.

## 4. Security considerations

- `isPlatformAdmin` is never settable through any user-facing API — only the bootstrap script and a platform-admin-gated promote action can set it. No route should ever accept it as client input on a general user-update endpoint.
- The "no account exists" branch of accept-invite creates a `UserDocument` directly from an unauthenticated request — token possession is the only credential. This matches the security bar of the existing (already-live) invitation-accept flow, which trusts the token the same way; the token is a hashed, single-use, 7-day-expiring secret, consistent with current `InvitationDocument` handling.
- Deleting the self-serve `POST /api/organizations` handler removes the only remaining way a plain authenticated user could create a `Membership` with `scopes: ["*"]` for themselves outside platform control — closes that path entirely.

## 5. Testing plan

- Unit: `requirePlatformAdmin` rejects non-admins (403) and missing session; accepts `isPlatformAdmin: true` users.
- Integration: `POST /api/admin/organizations` — creates org + invitation in one transaction, rejects when called by a non-platform-admin (403), rejects duplicate slug (existing 11000-collision handling, reused).
- Integration: accept-invite both branches — existing-account attach-membership path (regression-check the current behavior still works), and new "no account" path (creates User + Membership + session in one transaction, rejects expired/already-accepted tokens as today).
- Regression: confirm `app/api/auth/register` and the `POST` on `app/api/organizations` are gone (404/405) and that no reachable UI links to them.
- Manual: run the bootstrap script against a scratch DB, log in as that Super Admin, provision an org, follow the emailed accept link (or the queued `EmailEventDocument` in dev without Resend configured) end-to-end to a working `/dashboard`.

## 6. Out of scope (tracked for a follow-up spec)

- Tenant billing/subscription/plan tiers, payment collection, Stripe integration.
- Multiple tiers of platform staff (e.g., read-only support role) — today's scope is a single `isPlatformAdmin: boolean`.
- Migrating existing self-signed-up data — none exists yet (confirmed greenfield).
