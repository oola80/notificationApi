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
  createMappingSchema,
  TRANSFORM_OPTIONS,
  fieldMappingsFromApi,
  type CreateMappingFormData,
} from "@/lib/validators/mapping-schemas";
import type { EventMapping } from "@/types";

interface MappingFormProps {
  initialData?: EventMapping;
  onSubmit: (data: CreateMappingFormData) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
}

function MappingForm({
  initialData,
  onSubmit,
  isLoading = false,
  isEditing = false,
}: MappingFormProps) {
  const router = useRouter();

  const defaultFieldMappings = initialData?.fieldMappings
    ? fieldMappingsFromApi(initialData.fieldMappings)
    : [{ sourceField: "", targetField: "", transform: "none" as const, required: false, defaultValue: "" }];

  const form = useForm<CreateMappingFormData>({
    resolver: zodResolver(createMappingSchema),
    defaultValues: {
      sourceId: initialData?.sourceId ?? "",
      eventType: initialData?.eventType ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      priority: initialData?.priority ?? "normal",
      isActive: initialData?.isActive ?? true,
      fieldMappings: defaultFieldMappings,
      timestampField: initialData?.timestampField ?? "",
      timestampFormat: initialData?.timestampFormat ?? "",
      sourceEventIdField: initialData?.sourceEventIdField ?? "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "fieldMappings",
  });

  const handleFormSubmit = async (data: CreateMappingFormData) => {
    await onSubmit(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? "Edit Event Mapping" : "Create Event Mapping"}
        description={
          isEditing
            ? "Update the event mapping configuration"
            : "Configure a new runtime event mapping for source system integration"
        }
        actions={
          <Button
            variant="outline"
            onClick={() => router.push("/event-mappings")}
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
                        placeholder="e.g., OMS Order Shipped"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for this mapping
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="sourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source ID</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., oms" disabled={isEditing} {...field} />
                      </FormControl>
                      <FormDescription>
                        Unique source system identifier{isEditing ? " (cannot be changed)" : ""}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Type</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., order.shipped"
                          disabled={isEditing}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Source event type identifier{isEditing ? " (cannot be changed)" : ""}
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
                        placeholder="Describe what this mapping does..."
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Critical events are processed with higher priority
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isEditing && (
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Inactive mappings will not process incoming events
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
                )}
              </div>
            </CardContent>
          </Card>

          {/* Advanced options */}
          <Card>
            <CardHeader>
              <CardTitle>Advanced Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="timestampField"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timestamp Field</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., data.timestamp"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Path to the event timestamp in the payload
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timestampFormat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timestamp Format</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., ISO8601"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Format of the source timestamp
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sourceEventIdField"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Event ID Field</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., data.id"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Path to a unique event identifier in the source payload
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Field Mappings */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Field Mappings</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    sourceField: "",
                    targetField: "",
                    transform: "none",
                    required: false,
                    defaultValue: "",
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Field
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.formState.errors.fieldMappings?.message && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.fieldMappings.message}
                </p>
              )}

              {/* Header row */}
              {fields.length > 0 && (
                <div className="hidden grid-cols-[1fr_1fr_140px_60px_1fr_40px] items-center gap-2 text-sm font-medium text-muted-foreground md:grid">
                  <span>Source Path</span>
                  <span>Target Field</span>
                  <span>Transform</span>
                  <span>Req?</span>
                  <span>Default</span>
                  <span />
                </div>
              )}

              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_140px_60px_1fr_40px] md:items-start md:border-0 md:p-0"
                >
                  <FormField
                    control={form.control}
                    name={`fieldMappings.${index}.sourceField`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">
                          Source Path
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="data.orderNumber"
                            {...f}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`fieldMappings.${index}.targetField`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">
                          Target Field
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="orderId" {...f} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`fieldMappings.${index}.transform`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">
                          Transform
                        </FormLabel>
                        <Select
                          value={f.value}
                          onValueChange={f.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TRANSFORM_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`fieldMappings.${index}.required`}
                    render={({ field: f }) => (
                      <FormItem className="flex items-center pt-2 md:justify-center">
                        <FormLabel className="mr-2 md:sr-only">
                          Required
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={f.value}
                            onCheckedChange={f.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`fieldMappings.${index}.defaultValue`}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel className="md:sr-only">
                          Default Value
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Default"
                            {...f}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-1 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove field</span>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/event-mappings")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Create Mapping"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export { MappingForm };
