"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { ChannelDetail } from "@/components/channels";

export default function ChannelDetailPage() {
  const params = useParams<{ id: string }>();
  return <ChannelDetail channelId={params.id} />;
}
