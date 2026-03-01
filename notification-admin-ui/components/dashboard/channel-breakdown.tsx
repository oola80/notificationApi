"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui";
import { formatNumber } from "@/lib/formatters";
import type { ChannelBreakdownItem } from "@/types";

interface ChannelBreakdownProps {
  data: ChannelBreakdownItem[] | undefined;
  isLoading: boolean;
}

const CHANNEL_COLORS: Record<string, string> = {
  email: "var(--color-chart-4)",
  sms: "var(--color-chart-2)",
  whatsapp: "var(--color-chart-3)",
  push: "var(--color-chart-5)",
};

function getChannelColor(channel: string): string {
  return CHANNEL_COLORS[channel.toLowerCase()] ?? "var(--color-chart-1)";
}

function ChannelBreakdown({ data, isLoading }: ChannelBreakdownProps) {
  const chartData = (data ?? []).map((item) => ({
    channel: item.channel.charAt(0).toUpperCase() + item.channel.slice(1),
    rawChannel: item.channel,
    sent: item.totalSent,
    delivered: item.totalDelivered,
    failed: item.totalSent - item.totalDelivered,
    rate: item.deliveryRate,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Channel Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[250px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No channel data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="channel"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name)]}
              />
              <Legend />
              <Bar dataKey="delivered" name="Delivered" stackId="a">
                {chartData.map((entry) => (
                  <Cell key={entry.rawChannel} fill={getChannelColor(entry.rawChannel)} />
                ))}
              </Bar>
              <Bar dataKey="failed" name="Failed" stackId="a" fill="var(--color-chart-1)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export { ChannelBreakdown };
export type { ChannelBreakdownProps };
