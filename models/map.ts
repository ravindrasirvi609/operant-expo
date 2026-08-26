import type { ObjectId } from "mongodb";

import type { MapElementType, RectGeometry } from "@/types/domain";

export type AssetDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  checksum: string;
  visibility: "PUBLIC" | "PRIVATE";
  url: string;
  createdAt: Date;
};

export type FloorPlanDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  exhibitionId: ObjectId;
  hallId: ObjectId;
  version: number;
  backgroundAssetId?: ObjectId;
  canvasWidth: number;
  canvasHeight: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type MapElementDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  exhibitionId: ObjectId;
  hallId: ObjectId;
  floorPlanId: ObjectId;
  type: MapElementType;
  geometry: RectGeometry;
  label?: string;
  status?: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
  locked: boolean;
  visible: boolean;
  zIndex: number;
  createdAt: Date;
  updatedAt: Date;
};

