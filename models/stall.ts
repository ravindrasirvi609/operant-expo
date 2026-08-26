import type { ObjectId } from "mongodb";

export type StallDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  exhibitionId: ObjectId;
  hallId: ObjectId;
  floorPlanElementId: ObjectId;
  stallNumber: string;
  section?: string;
  stallType: "STANDARD" | "PREMIUM" | "CORNER" | "ISLAND" | "RAW_SPACE" | "SHELL_SCHEME";
  width: number;
  height: number;
  area: number;
  basePrice: number;
  currency: string;
  status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED" | "PENDING";
  description?: string;
  amenities: string[];
  visibility: "PUBLIC" | "PRIVATE";
  createdAt: Date;
  updatedAt: Date;
};

