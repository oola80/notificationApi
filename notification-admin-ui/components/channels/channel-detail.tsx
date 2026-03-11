"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Switch,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui";
import {
  PageHeader,
  ChannelIcon,
  ConfirmDialog,
  EmptyState,
  PageSkeleton,
} from "@/components/shared";
import { HealthIndicator, deriveHealthStatus } from "./health-indicator";
import { ProviderForm } from "./provider-form";
import {
  useChannel,
  useUpdateChannel,
  useProviders,
  useRegisterProvider,
  useDeleteProvider,
  useUpdateProvider,
} from "@/hooks/use-channels";
import {
  updateChannelSchema,
  type UpdateChannelFormData,
  ROUTING_MODES,
} from "@/lib/validators/channel-schemas";
import type { Channel, Provider, ChannelType } from "@/types";
import { ArrowLeft, Plus, Trash2, Settings2 } from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};

interface ChannelDetailProps {
  channelId: string;
}

function ChannelDetail({ channelId }: ChannelDetailProps) {
  const router = useRouter();
  const { data: channel, error, isLoading } = useChannel(channelId);
  const { data: allProviders } = useProviders();
  const updateChannel = useUpdateChannel(channelId);
  const registerProvider = useRegisterProvider();

  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Provider | null>(null);

  const channelProviders = React.useMemo(
    () => (allProviders ?? []).filter((p) => p.channel === channel?.type),
    [allProviders, channel?.type],
  );

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error || !channel) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push("/channels")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Channels
        </Button>
        <EmptyState
          title="Channel not found"
          description="The requested channel could not be loaded."
        />
      </div>
    );
  }

  const handleRegisterProvider = async (data: Parameters<typeof registerProvider.trigger>[0]) => {
    try {
      await registerProvider.trigger(data);
      toast.success("Provider registered successfully");
      setRegisterOpen(false);
    } catch {
      toast.error("Failed to register provider");
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.push("/channels")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Channels
      </Button>

      <PageHeader
        title={CHANNEL_LABELS[channel.type] ?? channel.name}
        description={`Configure the ${channel.type} delivery channel and its providers.`}
        actions={
          <div className="flex items-center gap-2">
            <ChannelIcon channel={channel.type} size={24} />
            <Badge variant={channel.isActive ? "success" : "secondary"}>
              {channel.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ChannelConfigForm channel={channel} onSubmit={updateChannel} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Providers</CardTitle>
              <Button size="sm" onClick={() => setRegisterOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Register Provider
              </Button>
            </CardHeader>
            <CardContent>
              {channelProviders.length === 0 ? (
                <EmptyState
                  icon={<Settings2 className="h-10 w-10" />}
                  title="No providers"
                  description="Register a provider adapter to start delivering notifications on this channel."
                  action={
                    <Button size="sm" onClick={() => setRegisterOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Register Provider
                    </Button>
                  }
                />
              ) : (
                <ProviderTable
                  providers={channelProviders}
                  onDelete={setDeleteTarget}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ProviderHealthCard
            channel={channel}
            providers={channelProviders}
          />
        </div>
      </div>

      <ProviderForm
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        channelType={channel.type}
        onSubmit={handleRegisterProvider}
        loading={registerProvider.isMutating}
      />

      {deleteTarget && (
        <DeleteProviderDialog
          provider={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        />
      )}
    </div>
  );
}

// --- Channel Configuration Form ---

interface ChannelConfigFormProps {
  channel: Channel;
  onSubmit: { trigger: (body?: UpdateChannelFormData) => Promise<Channel>; isMutating: boolean };
}

function ChannelConfigForm({ channel, onSubmit }: ChannelConfigFormProps) {
  const form = useForm<UpdateChannelFormData>({
    resolver: zodResolver(updateChannelSchema),
    defaultValues: {
      isActive: channel.isActive,
      routingMode: channel.routingMode,
      fallbackChannelId: channel.fallbackChannelId,
    },
  });

  React.useEffect(() => {
    form.reset({
      isActive: channel.isActive,
      routingMode: channel.routingMode,
      fallbackChannelId: channel.fallbackChannelId,
    });
  }, [channel, form]);

  const handleSubmit = async (data: UpdateChannelFormData) => {
    try {
      await onSubmit.trigger(data);
      toast.success("Channel configuration updated");
    } catch {
      toast.error("Failed to update channel configuration");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Channel Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Status</FormLabel>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span className="text-sm text-muted-foreground">
                        {field.value ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="routingMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Mode</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROUTING_MODES.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              <span className="capitalize">{mode}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="fallbackChannelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fallback Channel ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Optional — UUID of fallback channel"
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={onSubmit.isMutating}>
                Save Configuration
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// --- Provider Active Toggle ---

function ProviderActiveToggle({ provider }: { provider: Provider }) {
  const updateProvider = useUpdateProvider(provider.id);
  const [checked, setChecked] = React.useState(provider.isActive);

  React.useEffect(() => {
    setChecked(provider.isActive);
  }, [provider.isActive]);

  const handleToggle = async (value: boolean) => {
    setChecked(value);
    try {
      await updateProvider.trigger({ isActive: value });
      toast.success(`Provider "${provider.providerName}" ${value ? "activated" : "deactivated"}`);
    } catch {
      setChecked(provider.isActive);
      toast.error("Failed to update provider status");
    }
  };

  return (
    <Switch
      checked={checked}
      onCheckedChange={handleToggle}
      disabled={updateProvider.isMutating}
    />
  );
}

// --- Provider Table ---

interface ProviderTableProps {
  providers: Provider[];
  onDelete: (provider: Provider) => void;
}

function ProviderTable({ providers, onDelete }: ProviderTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Provider ID</TableHead>
            <TableHead>Adapter URL</TableHead>
            <TableHead className="text-center">Weight</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <TableRow key={provider.id}>
              <TableCell className="font-medium">
                {provider.providerName}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {provider.providerId}
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-xs">
                {provider.adapterUrl}
              </TableCell>
              <TableCell className="text-center">{provider.routingWeight}</TableCell>
              <TableCell className="text-center">
                <ProviderActiveToggle provider={provider} />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(provider)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Delete Provider Dialog ---

interface DeleteProviderDialogProps {
  provider: Provider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DeleteProviderDialog({
  provider,
  open,
  onOpenChange,
}: DeleteProviderDialogProps) {
  const deleteProvider = useDeleteProvider(provider.id);

  const handleConfirm = async () => {
    try {
      await deleteProvider.trigger(undefined);
      toast.success(`Provider "${provider.providerName}" deregistered`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to deregister provider");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Deregister Provider"
      description={`Are you sure you want to deregister "${provider.providerName}"? This will stop all notifications from being delivered through this provider.`}
      confirmLabel="Deregister"
      onConfirm={handleConfirm}
      loading={deleteProvider.isMutating}
    />
  );
}

// --- Provider Health Card ---

interface ProviderHealthCardProps {
  channel: Channel;
  providers: Provider[];
}

function ProviderHealthCard({ channel, providers }: ProviderHealthCardProps) {
  const activeProviders = providers.filter((p) => p.isActive);
  const healthStatus = deriveHealthStatus(channel.isActive, activeProviders.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Health Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Channel Status</span>
          <HealthIndicator status={healthStatus} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Active Providers
          </span>
          <span className="text-sm font-medium">
            {activeProviders.length} / {providers.length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Routing Mode</span>
          <span className="text-sm font-medium capitalize">
            {channel.routingMode}
          </span>
        </div>

        {providers.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Provider Health
            </p>
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between text-sm"
              >
                <span>{provider.providerName}</span>
                <HealthIndicator
                  status={provider.isActive ? "healthy" : "unknown"}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { ChannelDetail };
export type { ChannelDetailProps };
