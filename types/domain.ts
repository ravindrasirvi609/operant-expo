export const ORGANIZATION_ROLES = [
  "OWNER",
  "ORGANIZER_ADMIN",
  "ORGANIZER_STAFF",
  "MAP_EDITOR",
  "FINANCE",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const EXHIBITION_LIFECYCLES = [
  "DRAFT",
  "SETUP",
  "PUBLISHED",
  "BOOKING_OPEN",
  "BOOKING_CLOSED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type ExhibitionLifecycle = (typeof EXHIBITION_LIFECYCLES)[number];

export const STALL_STATUSES = [
  "AVAILABLE",
  "HELD",
  "BOOKED",
  "BLOCKED",
  "PENDING",
] as const;

export type StallStatus = (typeof STALL_STATUSES)[number];

export const BOOKING_STATUSES = [
  "HELD",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "BOOKING_REQUEST",
  "EXPIRED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type RectGeometry = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type MapElementType =
  | "STALL"
  | "ENTRANCE"
  | "EXIT"
  | "ZONE"
  | "STAGE"
  | "WALKWAY";

export type MapElement = {
  id: string;
  floorPlanId: string;
  type: MapElementType;
  geometry: RectGeometry;
  label?: string;
  locked: boolean;
  visible: boolean;
  zIndex: number;
};

export type Money = {
  amount: number;
  currency: string;
};

