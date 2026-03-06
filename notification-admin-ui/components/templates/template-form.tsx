"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Variable,
  Mail,
  MessageSquare,
  MessageCircle,
  Bell,
} from "lucide-react";
import {
  Button,
  Input,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui";
import { PageHeader, ChannelIcon } from "@/components/shared";
import { TipTapEditor } from "./tiptap-editor";
import { TemplatePreview } from "./template-preview";
import {
  createTemplateSchema,
  updateTemplateSchema,
  generateSlug,
  extractVariables,
  CHANNEL_OPTIONS,
  CHANNEL_LABELS,
  SMS_MAX_CHARS,
  PUSH_MAX_CHARS,
  type CreateTemplateFormData,
  type UpdateTemplateFormData,
  type ChannelOption,
} from "@/lib/validators/template-schemas";
import type { Template, ChannelType } from "@/types";

interface TemplateFormProps {
  initialData?: Template;
  onSubmit: (data: CreateTemplateFormData | UpdateTemplateFormData) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
}

const CHANNEL_ICONS: Record<ChannelOption, React.ElementType> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  push: Bell,
};

function TemplateForm({
  initialData,
  onSubmit,
  isLoading = false,
  isEditing = false,
}: TemplateFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<string>("email");

  // Use the appropriate schema
  const schema = isEditing ? updateTemplateSchema : createTemplateSchema;

  const defaultChannels = initialData?.versions?.[0]?.channels?.map((c) => ({
    channel: c.channel as ChannelOption,
    subject: c.subject ?? "",
    body: c.body,
    metadata: c.metadata,
  })) ?? [
    { channel: "email" as const, subject: "", body: "", metadata: undefined },
  ];

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEditing
      ? {
          channels: defaultChannels,
          changeSummary: "",
        }
      : {
          name: initialData?.name ?? "",
          slug: initialData?.slug ?? "",
          description: initialData?.description ?? "",
          channels: defaultChannels,
        },
  });

  const {
    fields: channelFields,
    append: appendChannel,
    remove: removeChannel,
  } = useFieldArray({
    control: form.control,
    name: "channels",
  });

  // Auto-generate slug from name (create mode only)
  const nameValue = form.watch("name");
  React.useEffect(() => {
    if (!isEditing && nameValue) {
      const currentSlug = form.getValues("slug" as "name"); // cast for create schema
      const autoSlug = generateSlug(nameValue);
      // Only auto-update if slug is empty or matches previous auto-generated slug
      if (!currentSlug || currentSlug === generateSlug(form.getValues("name").slice(0, -1))) {
        form.setValue("slug" as "name", autoSlug, { shouldValidate: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameValue, isEditing]);

  // Detect all variables from channel bodies
  const allVariables = React.useMemo(() => {
    const watchedChannels = form.watch("channels") ?? [];
    const allText = watchedChannels
      .map((c: { subject?: string; body: string }) => `${c.subject ?? ""} ${c.body}`)
      .join(" ");
    return extractVariables(allText);
  }, [form.watch("channels")]);

  // Get channels that are already added
  const addedChannels = channelFields.map((f) => f.channel);
  const availableChannels = CHANNEL_OPTIONS.filter(
    (ch) => !addedChannels.includes(ch),
  );

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    await onSubmit(data as CreateTemplateFormData | UpdateTemplateFormData);
  };

  const insertVariable = (varName: string) => {
    // This will insert the variable at the cursor of the currently active channel's body
    // For simplicity, we append to the current channel's body
    const currentChannelIdx = channelFields.findIndex(
      (f) => f.channel === activeTab,
    );
    if (currentChannelIdx === -1) return;
    const currentBody = form.getValues(`channels.${currentChannelIdx}.body`);
    form.setValue(
      `channels.${currentChannelIdx}.body`,
      `${currentBody}{{${varName}}}`,
      { shouldDirty: true },
    );
  };

  // Set initial active tab to first channel
  React.useEffect(() => {
    if (channelFields.length > 0 && !addedChannels.includes(activeTab as ChannelOption)) {
      setActiveTab(channelFields[0].channel);
    }
  }, [channelFields, activeTab, addedChannels]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? "Edit Template" : "Create Template"}
        description={
          isEditing
            ? "Update the template — this creates a new version"
            : "Create a new notification template with channel variants"
        }
        actions={
          <Button
            variant="outline"
            onClick={() => router.push("/templates")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to List
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main form */}
        <div className="lg:col-span-2">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleFormSubmit)}
              className="space-y-6"
            >
              {/* Basic fields */}
              <Card>
                <CardHeader>
                  <CardTitle>General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isEditing ? (
                    <>
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <Input
                          value={initialData?.name ?? ""}
                          disabled
                        />
                      </FormItem>
                      {initialData?.description && (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <Textarea
                            value={initialData.description}
                            rows={2}
                            disabled
                          />
                        </FormItem>
                      )}
                    </>
                  ) : (
                    <>
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Order Confirmation Email"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              A descriptive name for this template
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={"slug" as "name"}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Slug</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., order-confirmation-email"
                                className="font-mono text-sm"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              URL-safe identifier (auto-generated from name, editable)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe what this template is used for..."
                                rows={2}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {isEditing && (
                    <FormField
                      control={form.control}
                      name={"changeSummary" as "name"}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Change Summary</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Updated email subject line"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Describe what changed in this version
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Channel variants */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Channel Variants</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Add content for each notification channel
                    </p>
                  </div>
                  {availableChannels.length > 0 && (
                    <div className="flex items-center gap-1">
                      {availableChannels.map((ch) => {
                        const Icon = CHANNEL_ICONS[ch];
                        return (
                          <Button
                            key={ch}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              appendChannel({
                                channel: ch,
                                subject: (ch === "email" || ch === "push") ? "" : undefined,
                                body: "",
                                metadata: undefined,
                              });
                              setActiveTab(ch);
                            }}
                          >
                            <Icon className="mr-1.5 h-3.5 w-3.5" />
                            {CHANNEL_LABELS[ch]}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {channelFields.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No channel variants added. Add at least one channel above.
                    </div>
                  ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <div className="flex items-center justify-between">
                        <TabsList>
                          {channelFields.map((field) => (
                            <TabsTrigger
                              key={field.id}
                              value={field.channel}
                              className="gap-1.5"
                            >
                              <ChannelIcon channel={field.channel} size={14} />
                              {CHANNEL_LABELS[field.channel as ChannelOption]}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </div>

                      {channelFields.map((field, index) => (
                        <TabsContent
                          key={field.id}
                          value={field.channel}
                          className="mt-4 space-y-4"
                        >
                          {/* Subject (email and push) */}
                          {(field.channel === "email" || field.channel === "push") && (
                            <FormField
                              control={form.control}
                              name={`channels.${index}.subject`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel>Subject</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., Your order {{orderNumber}} has shipped!"
                                      {...f}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* Body */}
                          <FormField
                            control={form.control}
                            name={`channels.${index}.body`}
                            render={({ field: f }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel>Body</FormLabel>
                                  {(field.channel === "sms" || field.channel === "push") && (
                                    <CharacterCounter
                                      count={f.value?.length ?? 0}
                                      max={field.channel === "sms" ? SMS_MAX_CHARS : PUSH_MAX_CHARS}
                                    />
                                  )}
                                </div>
                                <FormControl>
                                  {field.channel === "email" ? (
                                    <TipTapEditor
                                      content={f.value ?? ""}
                                      onChange={f.onChange}
                                    />
                                  ) : (
                                    <Textarea
                                      placeholder={`Write your ${CHANNEL_LABELS[field.channel as ChannelOption]} message...`}
                                      rows={6}
                                      {...f}
                                    />
                                  )}
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Remove channel */}
                          {channelFields.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                removeChannel(index);
                                if (activeTab === field.channel && channelFields.length > 1) {
                                  const remaining = channelFields.filter(
                                    (_, i) => i !== index,
                                  );
                                  setActiveTab(remaining[0]?.channel ?? "email");
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Remove {CHANNEL_LABELS[field.channel as ChannelOption]}
                            </Button>
                          )}
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}

                  {form.formState.errors.channels?.message && (
                    <p className="mt-2 text-sm font-medium text-destructive">
                      {form.formState.errors.channels.message}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Form actions */}
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/templates")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? "Save Changes" : "Create Template"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        {/* Sidebar: Variables + Preview */}
        <div className="space-y-6">
          {/* Variable toolbar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Variable className="h-4 w-4" />
                Variables
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allVariables.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {allVariables.map((v) => (
                    <Badge
                      key={v}
                      variant="secondary"
                      className="cursor-pointer font-mono text-xs hover:bg-accent"
                      onClick={() => insertVariable(v)}
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Variables will appear here as you use {`{{variableName}}`} syntax
                  in your template content.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Preview panel */}
          {isEditing && initialData && (
            <TemplatePreview template={initialData} />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Character counter ---

function CharacterCounter({ count, max }: { count: number; max: number }) {
  const isOver = count > max;
  return (
    <span
      className={`text-xs ${isOver ? "text-destructive font-medium" : "text-muted-foreground"}`}
    >
      {count}/{max}
    </span>
  );
}

export { TemplateForm };
