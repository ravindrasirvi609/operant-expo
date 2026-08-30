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

/**
 * One floor plan per hall.
 *
 * Previously each edit session could create a new versioned document: the editor loaded the
 * highest version, so re-running setup produced an empty draft that hid all the placed stalls, and
 * publishing a new version orphaned every stall linked to the old version's elements. A single
 * living document per hall, promoted DRAFT -> PUBLISHED in place, makes both failures impossible.
 *
 * `revision` is a counter bumped on each publish, for display and audit only — it never selects
 * between documents.
 */
export type FloorPlanDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  exhibitionId: ObjectId;
  hallId: ObjectId;
  revision: number;
  backgroundAssetId?: ObjectId;
  canvasWidth: number;
  canvasHeight: number;
  /** Snap pitch in plan units. */
  gridSize: number;
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: Date;
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
  locked: boolean;
  visible: boolean;
  zIndex: number;
  createdAt: Date;
  updatedAt: Date;
};
