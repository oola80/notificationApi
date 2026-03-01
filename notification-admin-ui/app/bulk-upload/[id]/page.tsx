"use client";

import { use } from "react";
import { UploadDetail } from "@/components/bulk-upload";

export default function BulkUploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <UploadDetail uploadId={id} />;
}
