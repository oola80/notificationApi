"use client";

import { PageHeader } from "@/components/shared";
import { UploadZone, UploadHistory } from "@/components/bulk-upload";

export default function BulkUploadPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Upload"
        description="Upload XLSX files for bulk event submission."
      />
      <UploadZone />
      <UploadHistory />
    </div>
  );
}
