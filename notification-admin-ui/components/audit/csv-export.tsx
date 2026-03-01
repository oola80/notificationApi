"use client";

import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { toast } from "sonner";
import { useCsvExport } from "@/hooks/use-audit";
import type { AuditSearchParams } from "@/types";

interface CsvExportButtonProps {
  params?: AuditSearchParams;
}

function CsvExportButton({ params }: CsvExportButtonProps) {
  const { trigger, isExporting } = useCsvExport();

  const handleExport = async () => {
    try {
      await trigger(params);
      toast.success("CSV exported successfully");
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
        <Download className="mr-2 h-4 w-4" />
      )}
      {isExporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}

export { CsvExportButton };
export type { CsvExportButtonProps };
