"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import {
  PageHeader,
  ChannelIcon,
  CardGridSkeleton,
  EmptyState,
} from "@/components/shared";
import { HealthIndicator, deriveHealthStatus } from "./health-indicator";
import { useChannels, useProviders } from "@/hooks/use-channels";
import type { Channel, Provider } from "@/types";
import { Settings2 } from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};

function ChannelList() {
  const router = useRouter();
  const { data: channels, error: channelsError, isLoading: channelsLoading } = useChannels();
  const { data: providers } = useProviders();

  if (channelsLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Channels"
          description="Configure delivery channels and their providers."
        />
        <CardGridSkeleton count={4} className="sm:grid-cols-2 lg:grid-cols-2" />
      </div>
    );
  }

  if (channelsError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Channels"
          description="Configure delivery channels and their providers."
        />
        <EmptyState
          title="Failed to load channels"
          description="Could not fetch channel data. Please try again."
        />
      </div>
    );
  }

  const channelList = channels ?? [];
  const providerList = providers ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        description="Configure delivery channels and their providers."
      />
      {channelList.length === 0 ? (
        <EmptyState
          icon={<Settings2 className="h-12 w-12" />}
          title="No channels configured"
          description="Channels are seeded by the channel-router-service on startup."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {channelList.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              providers={providerList.filter(
                (p) => p.channel === channel.type,
              )}
              onClick={() => router.push(`/channels/${channel.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChannelCardProps {
  channel: Channel;
  providers: Provider[];
  onClick: () => void;
}

function ChannelCard({ channel, providers, onClick }: ChannelCardProps) {
  const activeProviders = providers.filter((p) => p.isActive);
  const healthStatus = deriveHealthStatus(channel.isActive, activeProviders.length);

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <ChannelIcon channel={channel.type} size={20} />
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">
            {CHANNEL_LABELS[channel.type] ?? channel.name}
          </CardTitle>
          <HealthIndicator status={healthStatus} />
        </div>
        <Badge variant={channel.isActive ? "success" : "secondary"}>
          {channel.isActive ? "Active" : "Inactive"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Providers</p>
            <p className="font-medium">
              {activeProviders.length} active / {providers.length} total
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Routing</p>
            <p className="font-medium capitalize">{channel.routingMode}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { ChannelList };
