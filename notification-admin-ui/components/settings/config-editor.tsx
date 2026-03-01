"use client";

import * as React from "react";
import { toast } from "sonner";
import { Save, Loader2, Settings2 } from "lucide-react";
import {
  Button,
  Input,
  Switch,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { EmptyState } from "@/components/shared";
import { useSystemConfigs } from "@/hooks/use-settings";
import { apiClient } from "@/lib/api-client";
import { formatDate } from "@/lib/formatters";
import type { SystemConfig } from "@/types";

/**
 * Group configs by category prefix (text before the first dot).
 * e.g., "retention.events.days" → "retention"
 */
function groupByCategory(configs: SystemConfig[]): Record<string, SystemConfig[]> {
  const groups: Record<string, SystemConfig[]> = {};
  for (const config of configs) {
    const dotIndex = config.key.indexOf(".");
    const category = dotIndex > 0 ? config.key.slice(0, dotIndex) : "general";
    if (!groups[category]) groups[category] = [];
    groups[category].push(config);
  }
  // Sort categories alphabetically, but "general" first
  const sorted: Record<string, SystemConfig[]> = {};
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === "general") return -1;
    if (b === "general") return 1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    sorted[key] = groups[key];
  }
  return sorted;
}

function formatCategoryLabel(category: string): string {
  return category
    .split(/[._-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Detect value type for appropriate input rendering.
 */
function detectValueType(value: string): "boolean" | "number" | "text" {
  if (value === "true" || value === "false") return "boolean";
  if (value !== "" && !isNaN(Number(value))) return "number";
  return "text";
}

interface ConfigRowProps {
  config: SystemConfig;
  onSaved: () => void;
}

function ConfigRow({ config, onSaved }: ConfigRowProps) {
  const [value, setValue] = React.useState(config.value);
  const [saving, setSaving] = React.useState(false);
  const isDirty = value !== config.value;
  const valueType = detectValueType(config.value);

  React.useEffect(() => {
    setValue(config.value);
  }, [config.value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(
        "admin",
        `/api/v1/system-configs/${encodeURIComponent(config.key)}`,
        { value },
      );
      toast.success(`Updated "${config.key}"`);
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to update "${config.key}"`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-3 rounded-lg border p-4 md:grid-cols-[1fr_200px_auto]">
      <div className="space-y-1">
        <p className="font-mono text-sm font-medium">{config.key}</p>
        {config.description && (
          <p className="text-sm text-muted-foreground">{config.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Last updated: {formatDate(config.updatedAt)}
        </p>
      </div>

      <div className="flex items-center">
        {valueType === "boolean" ? (
          <Switch
            checked={value === "true"}
            onCheckedChange={(checked) => setValue(checked ? "true" : "false")}
          />
        ) : (
          <Input
            type={valueType === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full"
          />
        )}
      </div>

      <div className="flex items-center">
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          disabled={!isDirty || saving}
          onClick={handleSave}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

function ConfigEditor() {
  const { data: configs, error, isLoading, mutate } = useSystemConfigs();

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
        title="Failed to load configuration"
        description={error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!configs || configs.length === 0) {
    return (
      <EmptyState
        title="No configuration entries"
        description="No system configuration entries are available"
        icon={<Settings2 className="h-10 w-10 text-muted-foreground" />}
      />
    );
  }

  const grouped = groupByCategory(configs);

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{formatCategoryLabel(category)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((config) => (
              <ConfigRow
                key={config.key}
                config={config}
                onSaved={() => mutate()}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { ConfigEditor };
