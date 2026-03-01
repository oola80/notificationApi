"use client";

import * as React from "react";
import { Upload, FileSpreadsheet, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { Card, CardContent } from "@/components/ui";
import { useCreateUpload } from "@/hooks/use-bulk-upload";

const MAX_SIZE_MB = parseInt(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB ?? "10",
  10,
);
const MAX_ROWS = parseInt(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_ROWS ?? "5000",
  10,
);
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadZoneProps {
  onUploadComplete?: (upload: { id: string }) => void;
  className?: string;
}

function UploadZone({ onUploadComplete, className }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { trigger, isMutating } = useCreateUpload();

  const validateFile = React.useCallback((file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return "Only .xlsx files are accepted.";
    }
    if (file.type && file.type !== ACCEPTED_TYPE && file.type !== "") {
      // Some browsers may not set the type correctly, so also check extension
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        return "Only .xlsx files are accepted.";
      }
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File size exceeds the maximum of ${MAX_SIZE_MB} MB.`;
    }
    return null;
  }, []);

  const handleFile = React.useCallback(
    (file: File) => {
      const error = validateFile(file);
      setValidationError(error);
      if (error) {
        setSelectedFile(null);
      } else {
        setSelectedFile(file);
      }
    },
    [validateFile],
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    [],
  );

  const handleDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    [],
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";
    },
    [handleFile],
  );

  const handleBrowse = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClear = React.useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
  }, []);

  const handleUpload = React.useCallback(async () => {
    if (!selectedFile) return;

    try {
      const result = await trigger(selectedFile);
      toast.success(`Upload started: ${selectedFile.name}`);
      setSelectedFile(null);
      setValidationError(null);
      onUploadComplete?.(result);
    } catch {
      toast.error("Upload failed. Please try again.");
    }
  }, [selectedFile, trigger, onUploadComplete]);

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!selectedFile ? handleBrowse : undefined}
          className={cn(
            "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            selectedFile && "cursor-default",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleInputChange}
            className="hidden"
          />

          {!selectedFile ? (
            <>
              <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium">
                Drag & drop XLSX file here
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Max: {MAX_SIZE_MB} MB &middot; {MAX_ROWS.toLocaleString()} rows
              </p>
            </>
          ) : (
            <div className="flex w-full items-center gap-3">
              <FileSpreadsheet className="h-10 w-10 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  disabled={isMutating}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpload();
                  }}
                  disabled={isMutating}
                >
                  {isMutating ? "Uploading\u2026" : "Upload"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {validationError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { UploadZone };
export type { UploadZoneProps };
