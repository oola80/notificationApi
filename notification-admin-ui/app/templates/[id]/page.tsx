"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { TemplateForm } from "@/components/templates";
import { useTemplate, useUpdateTemplate } from "@/hooks/use-templates";
import type { UpdateTemplateFormData } from "@/lib/validators/template-schemas";
import type { UpdateTemplateDto } from "@/types";

export default function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const { data: template, error, isLoading } = useTemplate(id);
  const { trigger: updateTemplate, isMutating } = useUpdateTemplate(id);

  const handleSubmit = async (data: unknown) => {
    const formData = data as UpdateTemplateFormData;
    const dto: UpdateTemplateDto = {
      name: formData.name,
      description: formData.description || undefined,
      channels: formData.channels.map((c) => ({
        channel: c.channel,
        subject: c.subject || undefined,
        body: c.body,
        metadata: c.metadata,
      })),
    };

    try {
      await updateTemplate(dto);
      toast.success("Template updated successfully");
      router.push("/templates");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update template",
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
        description="The requested notification template does not exist"
      />
    );
  }

  return (
    <TemplateForm
      initialData={template}
      onSubmit={handleSubmit}
      isLoading={isMutating}
      isEditing
    />
  );
}
