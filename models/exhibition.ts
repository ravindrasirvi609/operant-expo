import type { ObjectId } from "mongodb";

import type { ExhibitionLifecycle } from "@/types/domain";

export type VenueDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ExhibitionDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  venueId?: ObjectId;
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  timezone: string;
  startDate: Date;
  endDate: Date;
  lifecycle: ExhibitionLifecycle;
  bookingMode: "DISABLED" | "ONLINE" | "WAITLIST" | "REQUEST";
  createdAt: Date;
  updatedAt: Date;
};

export type HallDocument = {
  _id?: ObjectId;
  exhibitionId: ObjectId;
  organizationId: ObjectId;
  name: string;
  code: string;
  width: number;
  height: number;
  level?: string;
  status: "ACTIVE" | "INACTIVE";
  publicVisibility: boolean;
  createdAt: Date;
  updatedAt: Date;
};

