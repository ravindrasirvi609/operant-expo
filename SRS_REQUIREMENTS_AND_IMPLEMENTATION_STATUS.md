# Exhibition Management & Stall Booking SaaS

## SRS Requirements and Current Implementation Status

Date: 27 August 2026  
Source: `Exhibition_Management_Stall_Booking_SaaS_SRS.docx`  
Repository: `operant-expo`

## 1. How to Read This Document

The attached SRS is the product requirements document. Its normative requirements describe what the product must eventually do. This file compares those requirements with the code currently implemented in the repository.

Status meanings:

- **Implemented**: Code exists and the basic flow is operational.
- **Partial**: A foundation or prototype exists, but important production behavior, UI, or edge cases are missing.
- **Pending**: Requirement is not yet implemented.
- **Out of scope**: Explicitly excluded from the initial MVP by the SRS.

## 2. Executive Status Summary

The current application is a functional prototype foundation. It supports organization registration, tenant-aware authorization, exhibition/hall setup, Cloudflare R2 asset upload, basic map elements, stall records, public exhibition pages, reservations, bookings, mock payments, invoices, email events and organizer booking lists.

It is not yet production-ready. The highest-priority missing work is:

1. Complete map editor and map-to-stall workflow.
2. Real stall inventory editing and bulk operations.
3. Real payment provider and webhook processing.
4. Invoice PDF generation and secure downloads.
5. Resend email templates, outbox worker and retries.
6. Audit logging for commercial and permission-sensitive actions.
7. MongoDB transaction-based booking integrity.
8. Automated tests and security hardening.
9. Production deployment, monitoring, backups and restore testing.
10. Complete organizer, exhibitor and platform administration interfaces.

## 3. Current Implemented Routes

### Public routes

```text
/                       Marketing landing page
/exhibitions/[slug]     Public exhibition portal
/exhibitions/[slug]/book/[stallId]
                        Public hold and booking form
```

### Authentication routes

```text
/login
/register
/api/auth/login
/api/auth/register
/api/auth/logout
/api/auth/me
/api/auth/invitations/accept
```

### Organizer routes

```text
/dashboard
/dashboard/exhibitions
/dashboard/bookings
/dashboard/stalls
/dashboard/exhibitions/[exhibitionId]/halls/[hallId]/map
/dashboard/exhibitions/[exhibitionId]/halls/[hallId]/map/setup
/dashboard/exhibitions/[exhibitionId]/halls/[hallId]/map/edit
```

### Main API groups

```text
/api/me/organizations
/api/organizations/[organizationId]/venues
/api/organizations/[organizationId]/exhibitions
/api/organizations/[organizationId]/assets
/api/organizations/[organizationId]/bookings
/api/organizations/[organizationId]/invitations
/api/public/exhibitions/[exhibitionSlug]
/api/public/exhibitions/[exhibitionSlug]/stalls/[stallId]/hold
/api/public/exhibitions/[exhibitionSlug]/bookings
```

## 4. Requirement Status Matrix

| Area | SRS requirement | Status | Current state / remaining work |
|---|---|---|---|
| Tenant model | Organizations isolate all business data | Partial | Organization and membership models exist; full authorization coverage and tests are still needed. |
| Authentication | Secure modern authentication/session management | Partial | Custom password hashing and sessions exist; reset, email verification, MFA, session management UI and provider decision are pending. |
| Roles | Owner, admin, staff, map editor, finance, exhibitor roles | Partial | Core organizer roles exist; exhibitor user roles and complete permission matrix are incomplete. |
| Organization setup | Create organization and owner atomically | Partial | Registration creates both, but it is not transactionally atomic. |
| Invitations | Invite users and accept invitation | Partial | Basic invitation creation/acceptance exists; email delivery, token response security, expiry UI and invitation management are pending. |
| Exhibition CRUD | Create, edit, archive, duplicate exhibitions | Partial | Create/list/update exist; archive, duplicate, rich settings and lifecycle audit are pending. |
| Lifecycle | Draft to published to booking open/closed | Partial | UI and API actions exist; transition rules, validation depth, confirmation dialogs and audit events are incomplete. |
| Venue CRUD | Create and manage physical venues | Partial | Create/list foundation exists; edit/delete/detail screens are pending. |
| Hall CRUD | Multiple halls and public visibility | Partial | Create/list exists; edit/archive/status controls and dedicated UI are pending. |
| Floor-plan assets | Upload images/SVGs to object storage | Partial | Cloudflare R2 upload and metadata exist; private URLs, deletion, checksum deduplication and SVG sanitization are pending. |
| Map coordinate system | Canonical logical coordinates | Implemented | Rectangle geometry uses logical canvas coordinates. |
| Map elements | Stalls, entrances, exits, zones and stages | Partial | CRUD exists for basic elements; complete layer model and editor controls are pending. |
| Map viewer | Pan, zoom, fit, reset, focus and accessibility | Partial | Zoom, reset, selection and basic keyboard focus exist; pan gesture, fit-to-screen, filters and richer accessibility are pending. |
| Map editor | Professional non-technical editor | Partial | Basic add/select/label/drag/resize exists; undo/redo, snapping, alignment, rotation, layers, bulk selection and robust autosave are pending. |
| Map versions | Draft, publish and revert versions | Partial | Version creation and publishing exist; revert, comparison, immutable snapshots and version history UI are pending. |
| Stall inventory | Stall number, type, size, area, price and status | Partial | Model, create/list/update and basic UI exist; complete editing, deletion, bulk import/export and filters are pending. |
| Stall pricing | Base price, tax, add-ons, discounts and fees | Partial | Base price and commercial snapshot exist; tax rules, add-ons, discounts and fees are pending. |
| Exhibitor profiles | Company profile and multiple users | Partial | Company creation during booking exists; organizer CRUD, duplicate merging and exhibitor-user management are pending. |
| Public portal | SEO-friendly public exhibition page | Partial | Public page, hall and map rendering exist; full SEO metadata, sharing, branding and performance optimization are pending. |
| Stall discovery | Search/filter/map/list synchronization | Partial | Basic map click flow exists; search, filters, list view and availability filtering are pending. |
| Stall click booking | Click available map stall to book | Partial | Map-to-stall mapping and booking navigation now exist; stall records must be created and hold/booking UX needs further polish. |
| Reservation holds | Temporary hold with expiry | Partial | 15-minute hold and countdown exist; robust atomic transaction, renewal, release and background expiry processing are pending. |
| Booking state machine | Centralized valid commercial transitions | Partial | Basic statuses exist; centralized state machine service and complete transition enforcement are pending. |
| Double booking | Zero duplicate confirmed bookings | Partial | Availability checks and indexes exist; MongoDB transaction/concurrency tests are still required. |
| Cancellation | Policy-driven cancellation and refunds | Pending | Organizer cancellation exists, but policy engine and refund workflow are not implemented. |
| Payments | Provider-agnostic payment architecture | Partial | Interface and manual provider exist; production gateway, payment UI, webhooks and reconciliation are pending. |
| Invoices | Traceable invoice records and documents | Partial | Invoice records exist; PDF generation, numbering policy, secure download and tax details are pending. |
| Email | Resend transactional email | Partial | Email event queue and basic Resend call exist; React templates, outbox worker, retries and delivery operations are pending. |
| Organizer dashboard | Occupancy, revenue and booking metrics | Partial | Booking list and three basic counters exist; full dashboards, server aggregation, charts and reports are pending. |
| Platform admin | Tenant operations and support controls | Pending | No admin routes or UI exist. |
| Audit logs | Immutable commercial and permission history | Pending | Audit model is referenced but booking, payment, lifecycle and permission actions are not consistently logged. |
| Search | Stall, exhibitor, booking and invoice search | Partial | Basic lists exist; server-side search and indexes are pending. |
| Performance | Responsive maps and fast public pages | Partial | Basic rendering exists; measurements, optimization and load testing are pending. |
| Security | Auth, authorization, uploads, rate limiting and webhooks | Partial | Tenant checks and upload validation exist; rate limiting, CSP, webhook verification and formal security review are pending. |
| Privacy | Data governance and retention | Pending | No retention, export, deletion, consent or data classification workflow exists. |
| Accessibility | WCAG 2.1 AA key flows | Partial | Labels, buttons and focus basics exist; formal audit, keyboard editor flow and screen-reader testing are pending. |
| Observability | Logs, metrics, errors and alerts | Pending | Health endpoint exists; production monitoring, correlation IDs and alerting are pending. |
| Backups | Backup and restore process | Pending | No documented backup or restore test workflow exists in the repository. |
| Analytics | Product usage events | Pending | No analytics provider or event pipeline is implemented. |
| Testing | Unit, integration, E2E and visual regression | Pending | No automated test suite exists yet. |
| Deployment | Dev, staging, preview and production | Partial | App builds successfully; deployment configuration, secrets, migrations and release process are pending. |

## 5. Your Functional Requirements

### Organization and account requirements

- Users must be able to register and log in.
- Registration must create an organization owner.
- Organizations must be isolated from one another.
- Owners must invite organization users.
- Roles must restrict access to maps, exhibitions, bookings and finance.
- Sessions must be secure, expirable and revocable.

### Exhibition requirements

- Create, edit, publish, close, complete and archive exhibitions.
- Configure name, description, branding, venue, dates, timezone and contact details.
- Configure booking mode and booking policies.
- Use a public slug.
- Prevent publication when required configuration is missing.

### Venue and hall requirements

- Create multiple venues and halls.
- Configure hall dimensions, codes, levels and visibility.
- Keep historical bookings when a hall is disabled.
- Support multiple floor-plan versions per hall.

### Floor-plan and map requirements

- Upload an image or SVG floor plan.
- Store assets in Cloudflare R2.
- Use logical map coordinates independent of browser size.
- Add stalls and non-bookable elements.
- Drag, resize, rotate, align and duplicate map elements.
- Use grid snapping and exact geometry values.
- Save drafts and publish versions.
- Show map availability states.
- Support mouse, touch and keyboard interaction.

### Stall requirements

- Create a stall record linked to a map stall element.
- Store stall number, section, type, dimensions, area, price, tax, status and visibility.
- Support standard, premium, corner, island, raw-space and shell-scheme types.
- Make stall pricing extensible.
- Make public stalls visible only when public and available.

### Exhibitor requirements

- Create an exhibitor company during booking or before booking.
- Store company, legal, contact, address and tax information.
- Allow multiple users for one exhibitor company.
- Show company bookings, invoices and documents.
- Support duplicate exhibitor handling with audit history.

### Public booking requirements

- Render a public exhibition page.
- Allow hall selection.
- Show an interactive map and availability legend.
- Search and filter stalls.
- Click an available stall to see details.
- Hold the stall temporarily.
- Show an expiry countdown.
- Capture exhibitor details.
- Prevent double booking.
- Create a booking, payment record, invoice and notification event.

### Commercial requirements

- Never trust client totals.
- Preserve a commercial snapshot at booking time.
- Keep payment attempts separate from bookings.
- Verify payment webhooks server-side.
- Make webhook processing idempotent.
- Support invoice records and later invoice documents.
- Support cancellation, refunds, tax and discounts through configuration.

### Communication requirements

- Send invitation emails.
- Send booking confirmation emails.
- Send reservation expiry notifications.
- Send payment success/failure emails.
- Send cancellation, refund and invoice emails.
- Record email delivery status.
- Retry failed delivery without blocking bookings.

### Reporting requirements

- Show total, available, held and booked stalls.
- Show occupancy rate.
- Show gross, paid and pending amounts.
- Show recent bookings and payment events.
- Report by date, hall, section, type and exhibitor.
- Support tenant-scoped exports.

### Platform administration requirements

- Manage organizations and owners.
- Suspend and reactivate tenants.
- View platform metrics.
- Search audit logs.
- Manage global reference data.
- Support restricted, audited support access.

## 6. Highest-Priority Pending Work

### P0: Required before a real pilot

1. Add lifecycle controls and validation for every required transition.
2. Complete floor-plan setup and map publication UI.
3. Add map element drag, resize, rotation, snapping and autosave.
4. Add stall creation/editing UI linked to map elements.
5. Add public stall detail drawer and map click navigation.
6. Add MongoDB transaction-based hold and booking service.
7. Add booking idempotency and concurrency tests.
8. Add exhibitor details to organizer booking views.
9. Add invoice PDF generation or clearly support manual invoices.
10. Add proper Resend templates and reliable retries.
11. Add audit records for lifecycle, booking, payment and permission actions.
12. Add production error handling and rate limiting.

### P1: Required for a strong MVP

1. Real payment provider integration.
2. Payment webhook verification and reconciliation.
3. Organizer booking detail page.
4. Occupancy and revenue reports.
5. Exhibitor management screens.
6. Floor-plan version history and revert.
7. Public stall search/filter/list view.
8. File deletion and private asset access.
9. Accessibility review.
10. Unit, integration and end-to-end tests.

### P2: Future roadmap

1. Add-ons such as electricity, furniture and branding.
2. Custom shapes and polygon geometry.
3. Custom domains and white-labeling.
4. Bulk stall import/export.
5. Advanced analytics.
6. Subscription billing.
7. Multi-currency settlement.
8. CAD/BIM support.
9. Native mobile applications.
10. Integrations with the separate Abstract + Registration product.

## 7. Technical Gaps to Resolve

### Authentication

The SRS leaves the authentication provider open. Decide whether the custom session implementation remains or is replaced by a mature provider. If custom auth remains, add password reset, email verification, session listing/revocation and brute-force protection.

### Database transactions

The booking service must run on a MongoDB deployment that supports transactions, normally a replica set or managed MongoDB cluster. Hold creation, booking confirmation and commercial side effects should be designed around transactional boundaries and idempotent jobs.

### Storage

Cloudflare R2 is configured through the S3-compatible API. Production still needs a policy for public versus private objects, signed URLs, SVG sanitization, deletion, retention and CDN caching.

### Payment provider

The first production provider is still undecided. Stripe, Razorpay or another provider must be selected before payment launch. The adapter boundary already exists and should be retained.

### Email processing

Email events are currently recorded and can call Resend, but a production outbox worker, retry schedule, templates, verified sender domain and monitoring are required.

### Data validation

Several APIs use valid schemas, but all update payloads, status transitions, ownership checks and cross-resource relationships need a consistent domain-service layer.

## 8. Required Acceptance Criteria

The implementation should not be considered MVP complete until:

- An owner can register and create an organization.
- An owner can invite another user.
- Tenant data cannot cross organization boundaries.
- An organizer can create an exhibition, venue and hall.
- An organizer can upload a floor plan to R2.
- An organizer can create and publish a map.
- An organizer can create public available stall records.
- A public user can click an available stall.
- A public user can hold that stall.
- A countdown is visible and expires correctly.
- An exhibitor can submit booking details.
- Concurrent users cannot confirm the same stall.
- A booking has a commercial snapshot.
- Payment and invoice records are traceable.
- Email events are recorded and retried.
- Organizers can confirm or cancel bookings.
- All commercial state changes are audited.
- Public unpublished exhibitions are inaccessible.
- CI passes lint, typecheck, tests and production build.
- Backups and restore procedures are documented.
- Monitoring and production error reporting are active.

## 9. Recommended Remaining Implementation Sequence

```text
1. Fix environment file syntax and secret rotation.
2. Add an explicit database/index bootstrap command.
3. Complete map editor interaction and publish controls.
4. Complete stall inventory create/edit/status UI.
5. Connect public map click to stall details and booking.
6. Refactor hold/booking into transactional domain services.
7. Add exhibitor management and booking detail screens.
8. Add invoice PDF generation and secure download.
9. Add Resend templates and background email retries.
10. Add audit logging everywhere required.
11. Add payment provider and verified webhooks.
12. Add dashboards, reports and exports.
13. Add security, accessibility and performance hardening.
14. Add automated tests.
15. Deploy staging and run a real exhibition pilot.
```

## 10. Current Product Flow

```text
Register
  → Organization and owner membership
  → Login and session cookie
  → Exhibition creation
  → Venue and hall creation
  → Floor-plan upload to Cloudflare R2
  → Floor-plan draft creation
  → Map element creation
  → Stall inventory record creation
  → Map publication
  → Exhibition booking open
  → Public exhibition page
  → Stall click
  → Reservation hold
  → Exhibitor details
  → Booking record
  → Payment record
  → Invoice record
  → Email event
  → Organizer confirmation/cancellation
```

## 11. Final Assessment

The project has a solid prototype foundation and the core product direction is correct. The main risk is not missing basic CRUD; it is commercial correctness and production operations. Booking transactions, payment webhooks, auditability, reliable email, security, automated tests and deployment recovery must be completed before using the system for real paid exhibition bookings.
