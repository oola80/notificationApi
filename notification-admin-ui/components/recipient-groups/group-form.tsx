"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowLeft } from "lucide-react";
import {
  Button,
  Input,
  Textarea,
  Switch,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  createRecipientGroupSchema,
  type CreateRecipientGroupFormData,
} from "@/lib/validators/recipient-group-schemas";
import type { RecipientGroup } from "@/types";

interface GroupFormProps {
  initialData?: RecipientGroup;
  onSubmit: (data: CreateRecipientGroupFormData) => Promise<void>;
  isLoading?: boolean;
  isEditing?: boolean;
}

function GroupForm({
  initialData,
  onSubmit,
  isLoading = false,
  isEditing = false,
}: GroupFormProps) {
  const router = useRouter();

  const form = useForm<CreateRecipientGroupFormData>({
    resolver: zodResolver(createRecipientGroupSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      isActive: initialData?.isActive ?? true,
    },
  });

  const handleFormSubmit = async (data: CreateRecipientGroupFormData) => {
    await onSubmit(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? "Edit Recipient Group" : "Create Recipient Group"}
        description={
          isEditing
            ? "Update recipient group details and manage members"
            : "Create a new recipient group for notification targeting"
        }
        actions={
          <Button
            variant="outline"
            onClick={() => router.push("/recipient-groups")}
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
          <Card>
            <CardHeader>
              <CardTitle>Group Details</CardTitle>
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
                        placeholder="e.g., VIP Customers"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for this recipient group
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
                        placeholder="Describe the purpose of this group..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable this group for use in notification rules
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
            </CardContent>
          </Card>

          {/* Form actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/recipient-groups")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? "Save Changes" : "Create Group"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export { GroupForm };
