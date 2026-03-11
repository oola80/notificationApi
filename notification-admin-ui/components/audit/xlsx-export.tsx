"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { toast } from "sonner";
import { useXlsxExport } from "@/hooks/use-audit";
import type { AuditSearchParams } from "@/types";

interface XlsxExportButtonProps {
  params?: AuditSearchParams;
}

function XlsxExportButton({ params }: XlsxExportButtonProps) {
  const { trigger, isExporting } = useXlsxExport();

  const handleExport = async () => {
    try {
      await trigger(params);
      toast.success("XLSX exported successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      toast.error(message);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="mr-2 h-4 w-4" />
      )}
      {isExporting ? "Exporting..." : "Export XLSX"}
    </Button>
  );
}

export { XlsxExportButton };
export type { XlsxExportButtonProps };
