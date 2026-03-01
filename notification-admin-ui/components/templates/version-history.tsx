"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, History, RotateCcw, Loader2 } from "lucide-react";
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import {
  PageHeader,
  ConfirmDialog,
  EmptyState,
  ChannelIcon,
} from "@/components/shared";
import { useTemplate, useRollbackTemplate } from "@/hooks/use-templates";
import { formatDate } from "@/lib/formatters";
import type { TemplateVersion } from "@/types";

interface VersionHistoryProps {
  templateId: string;
}

function VersionHistory({ templateId }: VersionHistoryProps) {
  const router = useRouter();
  const { data: template, error, isLoading, mutate } = useTemplate(templateId);
  const { trigger: rollback, isMutating: isRollingBack } = useRollbackTemplate(templateId);

  const [rollbackTarget, setRollbackTarget] = React.useState<TemplateVersion | null>(null);

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    try {
      await rollback({ versionNumber: rollbackTarget.versionNumber });
      toast.success(`Rolled back to version ${rollbackTarget.versionNumber}`);
      setRollbackTarget(null);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to rollback template",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load template"
        description={error.message}
      />
    );
  }

  if (!template) {
    return (
      <EmptyState
        title="Template not found"
        description="The requested template does not exist"
      />
    );
  }

  const versions = [...(template.versions ?? [])].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Version History — ${template.name}`}
        description={`${versions.length} version${versions.length !== 1 ? "s" : ""} available`}
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/templates/${templateId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Template
          </Button>
        }
      />

      {versions.length === 0 ? (
        <EmptyState
          icon={<History className="h-10 w-10 text-muted-foreground" />}
          title="No versions"
          description="This template has no version history yet"
        />
      ) : (
        <div className="space-y-3">
          {versions.map((version) => {
            const isCurrent = template.currentVersionId === version.id;
            return (
              <Card
                key={version.id}
                className={isCurrent ? "border-primary/50" : undefined}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">
                        Version {version.versionNumber}
                      </CardTitle>
                      {isCurrent && (
                        <Badge variant="success">Current</Badge>
                      )}
                    </div>
                    {!isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRollbackTarget(version)}
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Rollback
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span>Created {formatDate(version.createdAt)}</span>
                    {version.createdBy && (
                      <span>by {version.createdBy}</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {version.channels.map((ch) => (
                        <Badge key={ch.channel} variant="secondary" className="gap-1 text-xs">
                          <ChannelIcon channel={ch.channel} size={12} />
                          {ch.channel}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!rollbackTarget}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
        title="Rollback Template"
        description={`Are you sure you want to rollback to version ${rollbackTarget?.versionNumber}? This will update the current version pointer.`}
        confirmLabel="Rollback"
        onConfirm={handleRollback}
        loading={isRollingBack}
      />
    </div>
  );
}

export { VersionHistory };
