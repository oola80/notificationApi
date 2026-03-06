"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { GroupForm, MemberManager } from "@/components/recipient-groups";
import {
  useRecipientGroup,
  useUpdateRecipientGroup,
} from "@/hooks/use-recipient-groups";
import type { CreateRecipientGroupFormData } from "@/lib/validators/recipient-group-schemas";
import type { UpdateRecipientGroupDto } from "@/types";

export default function RecipientGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const { data: group, error, isLoading } = useRecipientGroup(id);
  const { trigger: updateGroup, isMutating } = useUpdateRecipientGroup(id);

  const handleSubmit = async (data: CreateRecipientGroupFormData) => {
    const dto: UpdateRecipientGroupDto = {
      name: data.name,
      description: data.description || undefined,
    };

    try {
      await updateGroup(dto);
      toast.success("Recipient group updated successfully");
      router.push("/recipient-groups");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update recipient group",
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
        title="Failed to load recipient group"
        description={error.message}
      />
    );
  }

  if (!group) {
    return (
      <EmptyState
        title="Group not found"
        description="The requested recipient group does not exist"
      />
    );
  }

  return (
    <div className="space-y-6">
      <GroupForm
        initialData={group}
        onSubmit={handleSubmit}
        isLoading={isMutating}
        isEditing
      />
      <MemberManager groupId={id} />
    </div>
  );
}
