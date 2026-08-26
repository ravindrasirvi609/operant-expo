import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { saveAsset } from "@/lib/storage";
import type { AssetDocument } from "@/models/map";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "map:edit");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A file is required" }, { status: 400 });
  try {
    const stored = await saveAsset(file, `organizations/${organizationId}`);
    const asset: AssetDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), key: stored.key, filename: file.name, contentType: stored.contentType, size: stored.size, checksum: stored.checksum, visibility: "PUBLIC", url: stored.url, createdAt: new Date() };
    await (await getDatabase()).collection<AssetDocument>("assets").insertOne(asset);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload asset" }, { status: 400 }); }
}
