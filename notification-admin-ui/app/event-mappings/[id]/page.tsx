"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { EmptyState } from "@/components/shared";
import { MappingForm, MappingTestPanel } from "@/components/mappings";
import { useMapping, useUpdateMapping } from "@/hooks/use-mappings";
import { fieldMappingsToApi } from "@/lib/validators/mapping-schemas";
import type { CreateMappingFormData } from "@/lib/validators/mapping-schemas";
import type { UpdateMappingDto } from "@/types";

export default function MappingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "test" ? "test" : "edit";

  const { data: mapping, error, isLoading } = useMapping(id);
  const { trigger: updateMapping, isMutating } = useUpdateMapping(id);

  const handleSubmit = async (data: CreateMappingFormData) => {
    const dto: UpdateMappingDto = {
      name: data.name,
      description: data.description || undefined,
      priority: data.priority,
      isActive: data.isActive,
      fieldMappings: fieldMappingsToApi(data.fieldMappings),
      timestampField: data.timestampField || undefined,
      timestampFormat: data.timestampFormat || undefined,
      sourceEventIdField: data.sourceEventIdField || undefined,
    };

    try {
      await updateMapping(dto);
      toast.success("Mapping updated successfully");
      router.push("/event-mappings");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update mapping",
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
        title="Failed to load mapping"
        description={error.message}
      />
    );
  }

  if (!mapping) {
    return (
      <EmptyState
        title="Mapping not found"
        description="The requested event mapping does not exist"
      />
    );
  }

  return (
    <Tabs defaultValue={defaultTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="test">Test</TabsTrigger>
      </TabsList>

      <TabsContent value="edit">
        <MappingForm
          initialData={mapping}
          onSubmit={handleSubmit}
          isLoading={isMutating}
          isEditing
        />
      </TabsContent>

      <TabsContent value="test">
        <MappingTestPanel mappingId={id} />
      </TabsContent>
    </Tabs>
  );
}
