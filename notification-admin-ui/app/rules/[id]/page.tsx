"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared";
import { RuleForm } from "@/components/rules";
import { useRule, useUpdateRule } from "@/hooks/use-rules";
import {
  conditionsToApi,
  suppressionToApi,
} from "@/lib/validators/rule-schemas";
import type { CreateRuleFormData } from "@/lib/validators/rule-schemas";
import type { UpdateRuleDto } from "@/types";

export default function RuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const { data: rule, error, isLoading } = useRule(id);
  const { trigger: updateRule, isMutating } = useUpdateRule(id);

  const handleSubmit = async (data: CreateRuleFormData) => {
    const dto: UpdateRuleDto = {
      name: data.name,
      priority: data.priority,
      isExclusive: data.isExclusive,
      deliveryPriority: data.deliveryPriority,
      conditions: conditionsToApi(data.conditions ?? []),
      actions: data.actions.map((a) => ({
        templateId: a.templateId,
        channels: a.channels,
        recipientType: a.recipientType,
        recipientGroupId: a.recipientGroupId || undefined,
        delayMinutes: a.delayMinutes || undefined,
      })),
      suppression: suppressionToApi(
        data.suppressionEnabled,
        data.suppression,
      ),
    };

    try {
      await updateRule(dto);
      toast.success("Rule updated successfully");
      router.push("/rules");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update rule",
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
        title="Failed to load rule"
        description={error.message}
      />
    );
  }

  if (!rule) {
    return (
      <EmptyState
        title="Rule not found"
        description="The requested notification rule does not exist"
      />
    );
  }

  return (
    <RuleForm
      initialData={rule}
      onSubmit={handleSubmit}
      isLoading={isMutating}
      isEditing
    />
  );
}
