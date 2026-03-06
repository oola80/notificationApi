"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, Loader2, AlertTriangle } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { ChannelIcon } from "@/components/shared";
import { usePreviewTemplate } from "@/hooks/use-templates";
import { extractVariables } from "@/lib/validators/template-schemas";
import type { Template, RenderResult } from "@/types";

interface TemplatePreviewProps {
  template: Template;
}

function TemplatePreview({ template }: TemplatePreviewProps) {
  const { trigger: preview, isMutating } = usePreviewTemplate(template.id);
  const [results, setResults] = React.useState<RenderResult[]>([]);
  const [variableValues, setVariableValues] = React.useState<Record<string, string>>({});
  const [warnings, setWarnings] = React.useState<string[]>([]);

  // Extract variables from all channel bodies
  const allVariables = React.useMemo(() => {
    const latestVersion = template.versions?.[0];
    if (!latestVersion) return [];
    const allText = latestVersion.channels
      .map((c) => `${c.subject ?? ""} ${c.body}`)
      .join(" ");
    return extractVariables(allText);
  }, [template.versions]);

  // Also include declared variables from template
  const declaredVars = React.useMemo(() => {
    const fromTemplate = template.variables?.map((v) => v.variableName) ?? [];
    const combined = new Set([...allVariables, ...fromTemplate]);
    return Array.from(combined).sort();
  }, [allVariables, template.variables]);

  const handlePreview = async () => {
    try {
      // Check for missing required variables
      const missing = template.variables
        ?.filter((v) => v.isRequired && !variableValues[v.variableName])
        .map((v) => v.variableName) ?? [];

      if (missing.length > 0) {
        setWarnings([`Missing required variables: ${missing.join(", ")}`]);
      } else {
        setWarnings([]);
      }

      const result = await preview({ data: variableValues });
      setResults(result.previews);
      const channelWarnings = result.previews.flatMap((p) => p.warnings ?? []);
      if (channelWarnings.length > 0) {
        setWarnings((prev) => [...prev, ...channelWarnings]);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to preview template",
      );
    }
  };

  const channels = template.versions?.[0]?.channels ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Variable inputs */}
        {declaredVars.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Sample Variables</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {declaredVars.map((varName) => {
                const declared = template.variables?.find(
                  (v) => v.variableName === varName,
                );
                return (
                  <div key={varName} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {varName}
                      {declared?.isRequired && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <Input
                      placeholder={declared?.defaultValue ?? `Enter ${varName}`}
                      value={variableValues[varName] ?? ""}
                      onChange={(e) =>
                        setVariableValues((prev) => ({
                          ...prev,
                          [varName]: e.target.value,
                        }))
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button
          onClick={handlePreview}
          disabled={isMutating}
          className="w-full"
          variant="outline"
        >
          {isMutating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          Preview Template
        </Button>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <Tabs defaultValue={results[0].channel}>
            <TabsList>
              {results.map((r) => (
                <TabsTrigger key={r.channel} value={r.channel} className="gap-1.5">
                  <ChannelIcon channel={r.channel} size={14} />
                  {r.channel}
                </TabsTrigger>
              ))}
            </TabsList>
            {results.map((r) => (
              <TabsContent key={r.channel} value={r.channel} className="mt-3">
                {r.subject && (
                  <div className="mb-2">
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                      {r.subject}
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Body</Label>
                  {r.channel === "email" ? (
                    <div
                      className="rounded-md border bg-white p-4 text-sm text-black"
                      dangerouslySetInnerHTML={{ __html: r.body }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">
                      {r.body}
                    </pre>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* No results / no channels */}
        {results.length === 0 && channels.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No channel variants to preview
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { TemplatePreview };
