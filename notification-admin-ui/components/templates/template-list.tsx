"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  History,
  LayoutGrid,
  List,
  Eye,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  PageHeader,
  SearchInput,
  StatusBadge,
  ConfirmDialog,
  CardGridSkeleton,
  EmptyState,
  ChannelIcon,
} from "@/components/shared";
import { useTemplates, useDeleteTemplate } from "@/hooks/use-templates";
import { formatDate, formatRelativeTime } from "@/lib/formatters";
import type { Template, ChannelType } from "@/types";

function TemplateList() {
  const router = useRouter();

  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(50);
  const [search, setSearch] = React.useState("");
  const [channelFilter, setChannelFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");

  // Delete state
  const [deleteTarget, setDeleteTarget] = React.useState<Template | null>(null);
  const [deleteId, setDeleteId] = React.useState("");
  const { trigger: doDelete, isMutating: isDeleting } = useDeleteTemplate(deleteId);

  const { data, error, isLoading, mutate } = useTemplates({
    page,
    limit: pageSize,
    channel: channelFilter || undefined,
    isActive:
      statusFilter === "active"
        ? true
        : statusFilter === "inactive"
          ? false
          : undefined,
    search: search || undefined,
  });

  const templates = data?.data ?? [];

  const handleDelete = async () => {
    try {
      await doDelete();
      toast.success("Template deleted successfully");
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete template",
      );
    }
  };

  const getChannels = (template: Template): ChannelType[] => {
    const latestVersion = template.versions?.[0];
    if (!latestVersion) return [];
    return latestVersion.channels.map((c) => c.channel);
  };

  const getVersionNumber = (template: Template): number => {
    const latestVersion = template.versions?.[0];
    return latestVersion?.versionNumber ?? 0;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Manage notification templates with channel variants, versioning, and preview"
        actions={
          <Button onClick={() => router.push("/templates/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          placeholder="Search templates..."
          className="w-64"
        />

        <Select
          value={channelFilter}
          onValueChange={(val) => {
            setChannelFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="push">Push</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val === "all" ? "" : val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && <CardGridSkeleton count={6} />}

      {/* Error */}
      {error && !isLoading && (
        <EmptyState
          title="Failed to load templates"
          description={error.message}
          action={
            <Button variant="outline" onClick={() => mutate()}>
              Retry
            </Button>
          }
        />
      )}

      {/* Empty */}
      {!isLoading && !error && templates.length === 0 && (
        <EmptyState
          icon={<FileText className="h-10 w-10 text-muted-foreground" />}
          title="No templates found"
          description="Create your first notification template to get started"
          action={
            <Button onClick={() => router.push("/templates/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          }
        />
      )}

      {/* Grid view */}
      {!isLoading && !error && templates.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              channels={getChannels(template)}
              versionNumber={getVersionNumber(template)}
              onEdit={() => router.push(`/templates/${template.id}`)}
              onVersions={() => router.push(`/templates/${template.id}/versions`)}
              onPreview={() => router.push(`/templates/${template.id}`)}
              onDelete={() => {
                setDeleteId(template.id);
                setDeleteTarget(template);
              }}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && !error && templates.length > 0 && viewMode === "list" && (
        <div className="space-y-2">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              channels={getChannels(template)}
              versionNumber={getVersionNumber(template)}
              onEdit={() => router.push(`/templates/${template.id}`)}
              onVersions={() => router.push(`/templates/${template.id}/versions`)}
              onDelete={() => {
                setDeleteId(template.id);
                setDeleteTarget(template);
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination info */}
      {!isLoading && !error && templates.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {templates.length} of {data?.total ?? 0} templates
          </span>
          {data && data.page * data.limit < data.total && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
            >
              Load More
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This will deactivate the template.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
}

// --- Card subcomponent ---

interface TemplateCardProps {
  template: Template;
  channels: ChannelType[];
  versionNumber: number;
  onEdit: () => void;
  onVersions: () => void;
  onPreview: () => void;
  onDelete: () => void;
}

function TemplateCard({
  template,
  channels,
  versionNumber,
  onEdit,
  onVersions,
  onPreview,
  onDelete,
}: TemplateCardProps) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={onEdit}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{template.name}</CardTitle>
            <p className="mt-1 truncate text-xs text-muted-foreground font-mono">
              {template.slug}
            </p>
          </div>
          <StatusBadge status={template.isActive ? "active" : "inactive"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {template.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {template.description}
          </p>
        )}

        <div className="flex items-center gap-2">
          {channels.map((ch) => (
            <Badge key={ch} variant="secondary" className="gap-1 text-xs">
              <ChannelIcon channel={ch} size={12} />
              {ch}
            </Badge>
          ))}
          {channels.length === 0 && (
            <span className="text-xs text-muted-foreground">No channels</span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>v{versionNumber}</span>
          <span>{formatRelativeTime(template.updatedAt)}</span>
        </div>

        {/* Actions row */}
        <div
          className="flex items-center gap-1 border-t pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="sm" onClick={onPreview}>
            <Eye className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
          <Button variant="ghost" size="sm" onClick={onVersions}>
            <History className="mr-1 h-3.5 w-3.5" />
            Versions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Row subcomponent (list view) ---

interface TemplateRowProps {
  template: Template;
  channels: ChannelType[];
  versionNumber: number;
  onEdit: () => void;
  onVersions: () => void;
  onDelete: () => void;
}

function TemplateRow({
  template,
  channels,
  versionNumber,
  onEdit,
  onVersions,
  onDelete,
}: TemplateRowProps) {
  return (
    <div
      className="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:border-primary/50"
      onClick={onEdit}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{template.name}</span>
          <StatusBadge status={template.isActive ? "active" : "inactive"} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground font-mono">
          {template.slug}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {channels.map((ch) => (
          <ChannelIcon key={ch} channel={ch} className="text-muted-foreground" />
        ))}
      </div>

      <span className="text-sm text-muted-foreground">v{versionNumber}</span>
      <span className="hidden text-sm text-muted-foreground sm:block">
        {formatDate(template.updatedAt)}
      </span>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onVersions}>
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export { TemplateList };
