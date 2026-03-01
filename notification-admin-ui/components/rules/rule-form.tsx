"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import {
  Button,
  Input,
  Textarea,
  Switch,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui";
import { PageHeader } from "@/components/shared";
import {
  createRuleSchema,
  CONDITION_OPERATORS,
  CHANNEL_OPTIONS,
  RECIPIENT_TYPES,
  conditionsFromApi,
  suppressionFromApi,
  type CreateRuleFormData,
  type ConditionOperator,
} from "@/lib/validators/rule-schemas";
import type { Rule, ChannelType } from "@/types";

interface RuleFormProps {
  initialData?: Rule;
  onSubmit: (data: CreateRuleFormData) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
}

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "Equals",
  notEquals: "Not Equals",
  contains: "Contains",
  gt: "Greater Than",
  lt: "Less Than",
  gte: "Greater or Equal",
  lte: "Less or Equal",
  in: "In",
  notIn: "Not In",
  exists: "Exists",
  regex: "Regex",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};

function RuleForm({
  initialData,
  onSubmit,
  isLoading = false,
  isEditing = false,
}: RuleFormProps) {
  const router = useRouter();

  const defaultConditions = initialData
    ? conditionsFromApi(initialData.conditions)
    : [];

  const defaultSuppression = initialData
    ? suppressionFromApi(initialData.suppression)
    : { enabled: false };

  const defaultActions = initialData?.actions?.length
    ? initialData.actions.map((a) => ({
        templateId: a.templateId,
        channels: a.channels as [typeof CHANNEL_OPTIONS[number], ...typeof CHANNEL_OPTIONS[number][]],
        recipientType: a.recipientType as typeof RECIPIENT_TYPES[number],
        recipientGroupId: a.recipientGroupId ?? "",
        delayMinutes: a.delayMinutes ?? 0,
      }))
    : [
        {
          templateId: "",
          channels: ["email" as const] as [typeof CHANNEL_OPTIONS[number], ...typeof CHANNEL_OPTIONS[number][]],
          recipientType: "customer" as const,
          recipientGroupId: "",
          delayMinutes: 0,
        },
      ];

  const form = useForm<CreateRuleFormData>({
    resolver: zodResolver(createRuleSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      eventType: initialData?.eventType ?? "",
      priority: initialData?.priority ?? 100,
      isExclusive: initialData?.isExclusive ?? false,
      deliveryPriority: initialData?.deliveryPriority ?? undefined,
      conditions: defaultConditions,
      actions: defaultActions,
      suppressionEnabled: defaultSuppression.enabled,
      suppression: {
        windowMinutes: defaultSuppression.windowMinutes,
        maxCount: defaultSuppression.maxCount,
        key: defaultSuppression.key ?? "",
      },
    },
  });

  const {
    fields: conditionFields,
    append: appendCondition,
    remove: removeCondition,
  } = useFieldArray({
    control: form.control,
    name: "conditions",
  });

  const {
    fields: actionFields,
    append: appendAction,
    remove: removeAction,
  } = useFieldArray({
    control: form.control,
    name: "actions",
  });

  const suppressionEnabled = form.watch("suppressionEnabled");

  const handleFormSubmit = async (data: CreateRuleFormData) => {
    await onSubmit(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? "Edit Rule" : "Create Rule"}
        description={
          isEditing
            ? "Update the notification rule configuration"
            : "Configure a new notification rule to route events to channels"
        }
        actions={
          <Button
            variant="outline"
            onClick={() => router.push("/rules")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to List
          </Button>
        }
      />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="space-y-6"
        >
          {/* General section */}
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Order Shipped — Email + SMS"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for this rule
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Type</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., order.shipped"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormDescription>
                        The event type this rule matches
                        {isEditing && " (cannot be changed)"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="100"
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Lower value = higher priority (default 100)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this rule does..."
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="deliveryPriority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Priority</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(val) =>
                          field.onChange(val === "inherit" ? undefined : val)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Inherit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="inherit">Inherit</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Override the event delivery priority
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isExclusive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Exclusive</FormLabel>
                        <FormDescription>
                          Stop matching after this rule
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Conditions section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Conditions</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional conditions that the event payload must match
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendCondition({
                    field: "",
                    operator: "equals",
                    value: "",
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Condition
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {conditionFields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No conditions — this rule will match all events of the specified type.
                </p>
              )}

              {/* Header row */}
              {conditionFields.length > 0 && (
                <div className="hidden grid-cols-[1fr_180px_1fr_40px] items-center gap-2 text-sm font-medium text-muted-foreground md:grid">
                  <span>Field</span>
                  <span>Operator</span>
                  <span>Value</span>
                  <span />
                </div>
              )}

              {conditionFields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-[1fr_180px_1fr_40px] md:items-start md:border-0 md:p-0"
                >
                  <FormField
                    control={form.control}
                    name={`conditions.${index}.field`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">Field</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., totalAmount" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`conditions.${index}.operator`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">Operator</FormLabel>
                        <Select value={f.value} onValueChange={f.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONDITION_OPERATORS.map((op) => (
                              <SelectItem key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`conditions.${index}.value`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">Value</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 50" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeCondition(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove condition</span>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Actions section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Actions</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Define what happens when this rule matches
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendAction({
                    templateId: "",
                    channels: ["email"],
                    recipientType: "customer",
                    recipientGroupId: "",
                    delayMinutes: 0,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Action
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.formState.errors.actions?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.actions.message}
                </p>
              )}

              {actionFields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-4 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Action {index + 1}
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeAction(index)}
                      disabled={actionFields.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove action</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`actions.${index}.templateId`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Template ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., tpl-order-shipped"
                              {...f}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`actions.${index}.recipientType`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Recipient Type</FormLabel>
                          <Select value={f.value} onValueChange={f.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {RECIPIENT_TYPES.map((rt) => (
                                <SelectItem key={rt} value={rt}>
                                  {rt.charAt(0).toUpperCase() + rt.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Channels as checkboxes */}
                  <FormField
                    control={form.control}
                    name={`actions.${index}.channels`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Channels</FormLabel>
                        <div className="flex flex-wrap gap-4">
                          {CHANNEL_OPTIONS.map((ch) => {
                            const checked = f.value?.includes(ch) ?? false;
                            return (
                              <label
                                key={ch}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(val) => {
                                    const current = f.value ?? [];
                                    if (val) {
                                      f.onChange([...current, ch]);
                                    } else {
                                      f.onChange(
                                        current.filter(
                                          (c: string) => c !== ch,
                                        ),
                                      );
                                    }
                                  }}
                                />
                                {CHANNEL_LABELS[ch]}
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`actions.${index}.recipientGroupId`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Recipient Group ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Optional"
                              {...f}
                            />
                          </FormControl>
                          <FormDescription>
                            Required when recipient type is &quot;group&quot;
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`actions.${index}.delayMinutes`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel>Delay (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              placeholder="0"
                              {...f}
                              onChange={(e) =>
                                f.onChange(e.target.valueAsNumber || 0)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Delay delivery by this many minutes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Suppression section */}
          <Card>
            <CardHeader>
              <CardTitle>Suppression</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="suppressionEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Enable Suppression
                      </FormLabel>
                      <FormDescription>
                        Prevent duplicate notifications within a time window
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {suppressionEnabled && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="suppression.windowMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Window (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="e.g., 60"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? e.target.valueAsNumber
                                  : undefined,
                              )
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          Time window for dedup
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="suppression.maxCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Count</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="e.g., 3"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? e.target.valueAsNumber
                                  : undefined,
                              )
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          Maximum notifications per window
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="suppression.key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suppression Key</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., orderId"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Field to group notifications by
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Form actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/rules")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Create Rule"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export { RuleForm };
