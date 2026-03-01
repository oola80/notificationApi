"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Switch,
} from "@/components/ui";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui";
import {
  registerProviderSchema,
  type RegisterProviderFormData,
} from "@/lib/validators/channel-schemas";
import type { ChannelType } from "@/types";
import { Loader2 } from "lucide-react";

interface ProviderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelType: ChannelType;
  onSubmit: (data: RegisterProviderFormData) => Promise<void>;
  loading?: boolean;
}

function ProviderForm({
  open,
  onOpenChange,
  channelType,
  onSubmit,
  loading = false,
}: ProviderFormProps) {
  const form = useForm<RegisterProviderFormData>({
    resolver: zodResolver(registerProviderSchema),
    defaultValues: {
      providerName: "",
      providerId: "",
      channel: channelType,
      adapterUrl: "",
      isActive: true,
      routingWeight: 100,
      rateLimitTokensPerSec: undefined,
      rateLimitMaxBurst: undefined,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        providerName: "",
        providerId: "",
        channel: channelType,
        adapterUrl: "",
        isActive: true,
        routingWeight: 100,
        rateLimitTokensPerSec: undefined,
        rateLimitMaxBurst: undefined,
      });
    }
  }, [open, channelType, form]);

  const handleSubmit = async (data: RegisterProviderFormData) => {
    await onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Provider</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="providerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Mailgun Production" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="providerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. mailgun-prod" {...field} />
                  </FormControl>
                  <FormDescription>
                    Unique identifier for this provider instance.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adapterUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adapter URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="http://localhost:3170"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Base URL of the provider adapter microservice.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="routingWeight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Weight</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? undefined : Number(e.target.value),
                          )
                        }
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
                  <FormItem className="flex flex-col justify-end">
                    <FormLabel>Active</FormLabel>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label className="text-sm font-normal text-muted-foreground">
                        {field.value ? "Enabled" : "Disabled"}
                      </Label>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rateLimitTokensPerSec"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate Limit (tokens/sec)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Unlimited"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? undefined : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rateLimitMaxBurst"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Burst</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Unlimited"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? undefined : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Register Provider
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export { ProviderForm };
export type { ProviderFormProps };
