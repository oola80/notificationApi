"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TemplateForm } from "@/components/templates";
import { useCreateTemplate } from "@/hooks/use-templates";
import type { CreateTemplateFormData } from "@/lib/validators/template-schemas";
import type { CreateTemplateDto } from "@/types";

export default function NewTemplatePage() {
  const router = useRouter();
  const { trigger: createTemplate, isMutating } = useCreateTemplate();

  const handleSubmit = async (data: unknown) => {
    const formData = data as CreateTemplateFormData;
    const dto: CreateTemplateDto = {
      name: formData.name,
      slug: formData.slug,
      description: formData.description || undefined,
      channels: formData.channels.map((c) => ({
        channel: c.channel,
        subject: c.subject || undefined,
        body: c.body,
        metadata: c.metadata,
      })),
    };

    try {
      const result = await createTemplate(dto);
      toast.success("Template created successfully");
      router.push(`/templates/${result.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create template",
      );
    }
  };

  return <TemplateForm onSubmit={handleSubmit} isLoading={isMutating} />;
}
