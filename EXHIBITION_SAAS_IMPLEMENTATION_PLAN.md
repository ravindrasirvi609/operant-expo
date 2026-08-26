# Exhibition Management & Interactive Stall Booking SaaS

## Complete Implementation Plan

This plan is derived from `Exhibition_Management_Stall_Booking_SaaS_SRS.docx`.

The SRS is treated as the product requirements source. This file is the execution plan for implementing those requirements in the current Next.js project.

---

## 1. Product Boundary

The product is a standalone, multi-tenant SaaS platform for:

- Organizations and users
- Exhibitions
- Venues and halls
- Floor plans and interactive maps
- Stall inventory and pricing
- Exhibitor companies
- Reservations and bookings
- Payments and invoices
- Transactional email
- Organizer reporting
- Platform administration
- Audit logging

The initial product does not include abstract submission, speaker management, conference registration, badge printing, lead retrieval, native mobile applications, full ERP/accounting, universal tax compliance, or advanced CAD/BIM editing.

## 2. Technology Architecture

The current repository is a minimal Next.js starter. The product should be implemented using:

- Next.js 16.3.3 App Router
- TypeScript with strict checking
- React 19
- Tailwind CSS
- MongoDB
- Resend for email
- Object storage for floor plans, logos and invoices
- Provider-agnostic payment adapters
- Server-side route handlers and/or Server Actions

Recommended architecture:

```text
Public Portal / Organizer Dashboard / Admin Portal
                         |
                  Next.js App Router
                         |
             Route Handlers / Server Actions
                         |
                    Domain Services
                         |
          MongoDB / Object Storage / Providers
```

Business rules must live in server-side services. Client components should manage presentation and interaction only.

## 3. Recommended Project Structure

```text
app/
  (public)/
  (auth)/
  dashboard/
  exhibitions/
  admin/
  api/

components/
  shared/
  exhibition-map/
  map-editor/
  booking/
  dashboard/

lib/
  auth/
  db/
  permissions/
  validation/
  storage/
  errors/
  logging/

services/
  organizations/
  exhibitions/
  halls/
  maps/
  stalls/
  exhibitors/
  bookings/
  payments/
  invoices/
  emails/
  reports/
  audit/

models/
types/
emails/
config/
```

## 4. Core Data Model

### Organization

Tenant root containing name, slug, branding, plan, settings and status.

### User

Authentication identity containing email, name, status and login metadata.

### Membership

Connects a user to an organization with role, scopes and membership status.

Unique index:

```text
{ organizationId: 1, userId: 1 }
```

### Exhibition

Commercial event container containing organization, name, slug, venue, dates, timezone, lifecycle, branding, booking mode and booking policy.

Unique index:

```text
{ organizationId: 1, slug: 1 }
```

### Venue

Physical venue containing organization, name, address and contact information.

### Hall

Spatial area belonging to an exhibition. Contains name, code, dimensions, level, orientation and public visibility.

Unique index:

```text
{ exhibitionId: 1, code: 1 }
```

### FloorPlan

Versioned map configuration containing hall, version, background asset, canvas dimensions, viewport settings and publication status.

Only one floor plan per hall can be published at a time.

### MapElement

Generic spatial element supporting `STALL`, `ENTRANCE`, `EXIT`, `ZONE`, `STAGE` and `WALKWAY` in the MVP.

MVP geometry:

```ts
{
  type: "rect",
  x: number,
  y: number,
  width: number,
  height: number,
  rotation?: number
}
```

### Stall

Bookable commercial space containing hall, map element, stall number, section, type, dimensions, area, price, tax, status, visibility and amenities.

Unique index:

```text
{ hallId: 1, stallNumber: 1 }
```

### Exhibitor

Company/customer profile separate from user identity. Supports multiple users and multiple bookings.

### Booking

Commercial reservation containing exhibition, hall, stall, exhibitor, booking number, lifecycle status, payment mode and commercial snapshot.

The commercial snapshot must preserve base price, add-ons, discounts, tax, fees, total, currency and calculation timestamp.

### ReservationHold

Temporary stall lock containing stall, booking, status, expiry time and release time.

Indexes:

```text
{ stallId: 1, status: 1 }
{ expiresAt: 1, status: 1 }
```

### Payment

Payment attempt or transaction containing provider, provider reference, status, amount, currency, idempotency key and timestamps.

### Invoice

Invoice record containing invoice number, booking, totals, status and generated document asset.

### EmailEvent

Transactional email record containing recipient, template, delivery status, provider ID, attempts and errors.

### AuditLog

Immutable operational history containing organization, actor, action, entity, before/after values and request context.

## 5. Roles and Permissions

### Platform Owner

Manage organizations, plans, platform settings, support visibility, operational metrics and audit access.

### Organization Owner

Manage organization settings, users, exhibitions, commercial settings and reports.

### Organizer Admin

Create and publish exhibitions; manage halls, maps, stalls, exhibitors and bookings.

### Organizer Staff

Perform assigned exhibition operations according to scope.

### Map Editor

Create and maintain spatial map elements without financial access by default.

### Finance/Billing

View payments, invoices, refunds and commercial reports.

### Exhibitor Admin

Manage company profile, users, bookings, documents and invoices.

### Exhibitor Member

View permitted company bookings and documents.

### Public Visitor

Browse public exhibitions and discover available stalls.

Central authorization helpers should include:

```ts
requireAuthenticatedUser()
requireOrganizationMembership()
requirePermission()
assertOrganizationOwnership()
audit()
```

## 6. Functional Modules

### 6.1 Authentication and Tenancy

Implement login, logout, sessions, invitations, membership management, role-based access and tenant-aware request context.

Every protected operation must authenticate the user, load membership, verify resource ownership and enforce permissions server-side.

### 6.2 Organization Management

Build organization settings, branding, user list, invitations, roles, scopes and organization status management.

### 6.3 Exhibition Management

Build exhibition CRUD, branding, venue association, dates, timezone, public slug, booking policy and lifecycle transitions.

Lifecycle:

```text
DRAFT -> SETUP -> PUBLISHED -> BOOKING_OPEN -> BOOKING_CLOSED -> COMPLETED -> ARCHIVED
```

Publishing must validate public configuration, enabled halls and a publishable map unless content-only publication is deliberately enabled.

### 6.4 Venue and Hall Management

Implement venue CRUD, multiple halls per exhibition, dimensions, hall codes, floor levels, public visibility and map associations.

Disabling a hall must not delete historical bookings.

### 6.5 Asset Management

Support floor-plan images, SVGs, logos and invoice PDFs.

Use object storage with signed URLs, metadata records, checksums, MIME validation, size limits and SVG sanitization.

### 6.6 Interactive Map Viewer

Support pan, zoom, fit-to-screen, reset, stall selection, tooltips, search-to-focus, keyboard focus, touch interaction, availability legend and synchronized map/list filtering.

Use canonical logical map coordinates rather than browser pixels.

### 6.7 Map Editor

Editor layout:

```text
Top bar: Save | Undo | Redo | Preview | Publish
Left panel: Tools and layers
Center: Interactive map canvas
Right panel: Properties
```

MVP capabilities:

- Select background asset
- Set canvas size
- Add stalls and zones
- Add entrances and exits
- Move, resize and rotate elements
- Duplicate and multi-select
- Snap to grid
- Align and distribute
- Edit exact X/Y/width/height
- Assign stall numbers, sections and prices
- Lock and hide layers
- Save draft
- Preview public view
- Publish map version

Use client-side editor state with debounced saves, command history for undo/redo and immutable published snapshots.

### 6.8 Stall Inventory

Implement stall CRUD, stall types, numbering, sections, dimensions, area, pricing, tax configuration, descriptions, amenities, visibility and status.

Stall states:

```text
AVAILABLE | HELD | BOOKED | BLOCKED | PENDING
```

### 6.9 Public Exhibition Portal

Recommended routes:

```text
/exhibitions/[exhibitionSlug]
/exhibitions/[exhibitionSlug]/halls/[hallSlug]
/exhibitions/[exhibitionSlug]/book/[stallNumber]
```

Build landing pages, hall selection, interactive maps, search, filters, stall details, booking CTA, contact information, share metadata and SEO metadata.

Public APIs must not expose private organizer, user, payment or audit information.

### 6.10 Reservation and Booking

State machine:

```text
AVAILABLE -> HELD -> PAYMENT_PENDING -> CONFIRMED
HELD -> EXPIRED -> AVAILABLE
CONFIRMED -> CANCELLED -> AVAILABLE or BLOCKED
CONFIRMED -> REFUND_PENDING -> REFUNDED
```

Rules:

- Availability is checked server-side.
- Holds have configurable expiry.
- Expiry processing is idempotent.
- Booking confirmation uses idempotency keys.
- Client retries cannot create duplicates.
- Concurrent confirmation attempts are resolved atomically.
- Cancellation behavior is configuration-driven.

### 6.11 Payments and Invoices

Create a provider abstraction before selecting a production gateway:

```ts
interface PaymentProvider {
  createPaymentIntent(input): Promise<PaymentIntent>
  verifyWebhook(input): Promise<WebhookEvent>
  refundPayment(input): Promise<RefundResult>
  getPaymentStatus(input): Promise<PaymentStatus>
}
```

The MVP may use manual or mock payment processing, but production integration must support server-calculated totals, payment attempts, verified webhooks, idempotent processing, refunds and invoice records.

### 6.12 Email and Notifications

Use reusable React email templates with Resend.

Required events include organization invitation, exhibition publication, booking creation, reservation expiry, payment success/failure, booking confirmation/cancellation, refunds, invoice availability and organizer notifications.

Use an outbox/retry pattern so email delivery does not block booking transactions.

### 6.13 Organizer Dashboard and Reports

Dashboard metrics:

- Total stalls
- Available, held and booked counts
- Occupancy rate
- Gross booking value
- Paid and pending amounts
- Recent bookings
- Payment activity
- Top sections and stall types

Reports should include stall inventory, occupancy, bookings by date, revenue, outstanding payments and exhibitors. Use server-side aggregation and pagination.

### 6.14 Platform Administration

Implement organization administration, tenant suspension/reactivation, plan metadata, global defaults, audit search, platform metrics and restricted support operations.

Support impersonation should only be added after explicit security and audit requirements are approved.

## 7. API Plan

```text
/api/auth/*
/api/organizations/*
/api/memberships/*
/api/exhibitions/*
/api/venues/*
/api/halls/*
/api/floor-plans/*
/api/map-elements/*
/api/stalls/*
/api/exhibitors/*
/api/reservations/*
/api/bookings/*
/api/payments/*
/api/invoices/*
/api/emails/*
/api/audit/*
/api/admin/*
```

All mutations require authentication, authorization, schema validation, tenant verification and audit logging where applicable. Payment, confirmation and webhook endpoints must be idempotent.

## 8. Frontend Routes

```text
app/
├── (public)/exhibitions/[exhibitionSlug]/
├── (auth)/login/
├── (auth)/invite/
├── (auth)/reset-password/
├── dashboard/
├── exhibitions/[id]/
│   ├── halls/
│   ├── map-editor/
│   ├── stalls/
│   ├── exhibitors/
│   ├── bookings/
│   └── reports/
└── admin/
    ├── organizations/
    ├── users/
    ├── exhibitions/
    └── audit/
```

Use Server Components for data-heavy pages and Client Components for maps, editors, filters, drawers, dialogs and countdowns.

## 9. Development Phases

### Phase 0: Product Decisions

Finalize:

- Authentication provider
- First payment gateway
- Object-storage provider
- Email sender domain
- Payment versus approval booking mode
- Currency and tax assumptions
- Exhibitor account requirements
- Cancellation rules
- Subscription or transaction pricing model

### Phase 1: Application Foundation

Build:

- Project conventions
- Design system
- Environment configuration
- Error handling
- Logging
- Database connection
- Models and indexes
- Validation utilities
- CI pipeline

### Phase 2: Authentication and Tenancy

Build users, sessions, organizations, memberships, roles, invitations, tenant context and authorization helpers.

Add cross-tenant isolation tests before business modules.

### Phase 3: Exhibitions, Venues and Halls

Build organization settings, venue CRUD, exhibition CRUD, lifecycle, branding, halls, public slugs and publication validation.

### Phase 4: Asset Management

Build object-storage integration, uploads, metadata, signed URLs, SVG sanitization and asset access control.

### Phase 5: Map Viewer

Build coordinate model, canvas rendering, pan/zoom, fit-to-screen, map elements, selection, legend and mobile interactions.

### Phase 6: Map Editor

Build editor workspace, layers, rectangle stalls, zones, geometry controls, snapping, undo/redo, draft saving, preview and publishing.

### Phase 7: Stall Inventory and Public Discovery

Build stall CRUD, pricing, statuses, public exhibition pages, search, filtering, stall details and SEO metadata.

### Phase 8: Reservation and Booking

Build holds, countdowns, booking forms, exhibitor creation, state transitions, expiry processing, cancellations, concurrency controls and audit events.

### Phase 9: Payments and Invoicing

Build payment abstraction, manual/mock provider, payment attempts, webhooks, commercial snapshots, invoice records, PDFs and refunds.

### Phase 10: Email

Build email events, Resend integration, templates, outbox processing, retries and delivery status.

### Phase 11: Dashboard and Reports

Build occupancy, booking, revenue, payment and exhibitor reporting with filters and pagination.

### Phase 12: Administration

Build platform administration, tenant suspension, global reference data, operational metrics and audit search.

### Phase 13: Hardening and Pilot

Complete security, accessibility, performance, backup restore, monitoring, deployment and pilot onboarding.

## 10. MVP Scope

The MVP must include:

- Authentication and organization tenancy
- Roles and permissions
- Exhibition, venue and hall management
- Floor-plan upload
- Rectangle-based map editor
- Interactive map viewer
- Stall inventory and pricing
- Public exhibition pages
- Stall search and filtering
- Reservation holds
- Booking workflow
- Double-booking protection
- Payment-ready architecture
- Manual/mock payment support
- Invoice records
- Resend notifications
- Organizer dashboard
- Basic reports
- Audit logging
- Responsive UI
- Security and tenant-isolation tests
- CI/CD and production deployment

Defer polygons, add-ons, custom domains, white-labeling, advanced analytics, bulk inventory tools, CAD/PDF vectorization and native mobile applications to P1/P2.

## 11. Testing Strategy

### Unit Tests

Cover pricing, taxes, permissions, state transitions, cancellation rules, geometry operations, idempotency and invoice numbering.

### Integration Tests

Cover MongoDB persistence, tenant isolation, publishing, map saves, booking transactions, hold expiry, payment webhooks, email events and audit logs.

### End-to-End Tests

Test the full flow:

1. Create organization.
2. Invite user.
3. Create exhibition.
4. Create hall.
5. Upload floor plan.
6. Create and publish stalls.
7. Search publicly.
8. Create reservation.
9. Complete booking.
10. Generate invoice and email.
11. Verify dashboard metrics.
12. Verify competing user cannot book the same stall.

### Security Tests

Test cross-tenant access, role escalation, invalid webhooks, replay attacks, malicious uploads, private assets, rate limits and session revocation.

### Performance Tests

Validate several hundred map elements, fast public rendering, near sub-second search under normal load and scalable dashboard aggregation.

## 12. Security Plan

Implement:

- Secure HTTP-only cookies
- Session expiration and revocation
- Server-side authorization
- Zod request validation
- Rate limiting
- Secure headers
- Password hashing through a mature auth solution
- Webhook signature verification
- Idempotent webhook processing
- MIME and file-size validation
- SVG sanitization
- Signed private asset URLs
- Tenant-aware cache keys
- Secret management through deployment configuration
- Immutable audit logs
- Minimal sensitive data in emails

Tenant authorization is the primary security control and must not depend on UI filtering.

## 13. Observability

Implement:

- Structured logs
- Request correlation IDs
- Error monitoring
- Booking and payment event logs
- Email delivery logs
- Database health checks
- Background processing failure visibility
- API latency metrics
- Authentication failure metrics
- Alerts for webhook, email and reservation-processing failures

## 14. Deployment

Environments:

```text
Local
Development
Preview/Staging
Production
```

Each environment must use separate databases, storage buckets, credentials, secrets and analytics identifiers.

CI must run:

```text
Install dependencies
Lint
TypeScript validation
Unit tests
Integration tests
Build
Security checks
```

Production deployment should be blocked when required checks fail.

## 15. Backup and Recovery

Implement scheduled database backups, object-storage versioning, asset and invoice retention, restore documentation, restore testing and backup monitoring.

Initial operational targets:

```text
RPO: 24 hours or better
RTO: 4 hours or better
```

These targets should be confirmed against commercial requirements.

## 16. Analytics Events

Track exhibition creation/publication, map publication, stall views, searches, filters, booking starts, reservations, expirations, payment outcomes, confirmations, cancellations, invoice downloads, email delivery, editor saves and editor publishing.

Do not collect unnecessary personal or payment data.

## 17. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Map editor becomes too complex | Start with rectangles and zones |
| Double booking | Transactions, holds, unique constraints and idempotency |
| Tenant data leakage | Central authorization and automated isolation tests |
| Payment webhook failure | Verification, retries and reconciliation |
| Lost map edits | Draft persistence, autosave and versioning |
| Slow large maps | Optimized assets and efficient rendering |
| Email failure | Outbox pattern and retries |
| Provider lock-in | Storage, payment and email adapters |
| Tax complexity | Separate tax values and configurable rules |
| Excessive customization | Configuration-driven models |

## 18. Definition of Done

The MVP is ready when:

- An organization can be created.
- Users can be invited and assigned roles.
- An organizer can create an exhibition and hall.
- A floor plan can be uploaded.
- Interactive stalls can be positioned and published.
- Visitors can search and inspect stalls.
- Exhibitors can submit bookings.
- Holds expire correctly.
- Concurrent booking attempts cannot create duplicate confirmed bookings.
- Payment and invoice records are traceable.
- Booking emails are delivered or retried.
- Dashboard metrics are tenant-scoped.
- Commercial actions are audited.
- Unauthorized and cross-tenant requests are rejected.
- CI passes lint, typecheck, tests and build.
- Backup and restore procedures are documented.
- Monitoring and production error reporting are active.
- A pilot exhibition can be operated without developer intervention.

## 19. First Vertical Slice

The first implementation milestone should validate the highest-risk workflow:

1. Create an organization.
2. Create an exhibition.
3. Create one hall.
4. Upload a floor-plan image.
5. Add rectangle-based stalls.
6. Publish the map.
7. View the map publicly.
8. Select a stall.
9. Create a temporary reservation.
10. Confirm a test booking.

Once this flow works securely, expand into payments, invoices, reporting, administration and advanced editor capabilities.
