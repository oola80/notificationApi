"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RuleForm } from "@/components/rules";
import { useCreateRule } from "@/hooks/use-rules";
import {
  conditionsToApi,
  suppressionToApi,
} from "@/lib/validators/rule-schemas";
import type { CreateRuleFormData } from "@/lib/validators/rule-schemas";
import type { CreateRuleDto } from "@/types";

export default function NewRulePage() {
  const router = useRouter();
  const { trigger: createRule, isMutating } = useCreateRule();

  const handleSubmit = async (data: CreateRuleFormData) => {
    const dto: CreateRuleDto = {
      name: data.name,
      eventType: data.eventType,
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
      const result = await createRule(dto);
      toast.success("Rule created successfully");
      router.push(`/rules/${result.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create rule",
      );
    }
  };

  return <RuleForm onSubmit={handleSubmit} isLoading={isMutating} />;
}
