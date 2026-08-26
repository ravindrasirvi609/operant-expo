import type { ObjectId } from "mongodb";

import type { OrganizationRole } from "@/types/domain";

export type UserStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
export type MembershipStatus = "ACTIVE" | "INVITED" | "REVOKED";

export type UserDocument = {
  _id?: ObjectId;
  email: string;
  name: string;
  status: UserStatus;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OrganizationDocument = {
  _id?: ObjectId;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  userId: ObjectId;
  role: OrganizationRole;
  scopes: string[];
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionDocument = {
  _id?: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
};

export type InvitationDocument = {
  _id?: ObjectId;
  organizationId: ObjectId;
  email: string;
  role: OrganizationRole;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: ObjectId;
  acceptedAt?: Date;
  createdAt: Date;
};
