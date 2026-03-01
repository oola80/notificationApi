"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GroupForm } from "@/components/recipient-groups";
import { useCreateRecipientGroup } from "@/hooks/use-recipient-groups";
import type { CreateRecipientGroupFormData } from "@/lib/validators/recipient-group-schemas";
import type { CreateRecipientGroupDto } from "@/types";

export default function NewRecipientGroupPage() {
  const router = useRouter();
  const { trigger: createGroup, isMutating } = useCreateRecipientGroup();

  const handleSubmit = async (data: CreateRecipientGroupFormData) => {
    const dto: CreateRecipientGroupDto = {
      name: data.name,
      description: data.description || undefined,
    };

    try {
      const result = await createGroup(dto);
      toast.success("Recipient group created successfully");
      router.push(`/recipient-groups/${result.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create recipient group",
      );
    }
  };

  return <GroupForm onSubmit={handleSubmit} isLoading={isMutating} />;
}
