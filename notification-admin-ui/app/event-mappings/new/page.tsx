"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MappingForm } from "@/components/mappings";
import { useCreateMapping } from "@/hooks/use-mappings";
import { fieldMappingsToApi } from "@/lib/validators/mapping-schemas";
import type { CreateMappingFormData } from "@/lib/validators/mapping-schemas";
import type { CreateMappingDto } from "@/types";

export default function NewMappingPage() {
  const router = useRouter();
  const { trigger: createMapping, isMutating } = useCreateMapping();

  const handleSubmit = async (data: CreateMappingFormData) => {
    const dto: CreateMappingDto = {
      sourceId: data.sourceId,
      eventType: data.eventType,
      name: data.name,
      description: data.description || undefined,
      priority: data.priority,
      fieldMappings: fieldMappingsToApi(data.fieldMappings),
      timestampField: data.timestampField || undefined,
      timestampFormat: data.timestampFormat || undefined,
      sourceEventIdField: data.sourceEventIdField || undefined,
    };

    try {
      const result = await createMapping(dto);
      toast.success("Mapping created successfully");
      router.push(`/event-mappings/${result.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create mapping",
      );
    }
  };

  return <MappingForm onSubmit={handleSubmit} isLoading={isMutating} />;
}
