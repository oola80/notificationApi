"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { subDays, subHours, startOfDay, formatISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui";
import { Button } from "@/components/ui";
import { useAnalytics } from "@/hooks/use-dashboard";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { AnalyticsDataPoint } from "@/types";

type TimeRange = "24h" | "7d" | "30d";

interface ChartPoint {
  time: string;
  label: string;
  sent: number;
  delivered: number;
  failed: number;
}

function buildDateRange(range: TimeRange): { from: string; to: string; period: "hourly" | "daily" } {
  const now = new Date();
  switch (range) {
    case "24h":
      return {
        from: formatISO(subHours(now, 24)),
        to: formatISO(now),
        period: "hourly",
      };
    case "7d":
      return {
        from: formatISO(startOfDay(subDays(now, 7))),
        to: formatISO(now),
        period: "daily",
      };
    case "30d":
      return {
        from: formatISO(startOfDay(subDays(now, 30))),
        to: formatISO(now),
        period: "daily",
      };
  }
}

function aggregateByTime(data: AnalyticsDataPoint[], range: TimeRange): ChartPoint[] {
  // Filter for _all channel (cross-channel totals)
  const allChannel = data.filter((d) => d.channel === "_all");

  return allChannel.map((point) => ({
    time: point.periodStart,
    label: range === "24h"
      ? formatDate(point.periodStart, "HH:mm")
      : formatDate(point.periodStart, "MMM d"),
    sent: point.totalSent,
    delivered: point.totalDelivered,
    failed: point.totalFailed,
  }));
}

function DeliveryChart() {
  const [range, setRange] = React.useState<TimeRange>("24h");

  const { from, to, period } = buildDateRange(range);
  const { data: analytics, isLoading } = useAnalytics({
    from,
    to,
    period,
    channel: "_all",
    pageSize: 200,
  });

  const chartData = React.useMemo(() => {
    if (!analytics?.data) return [];
    return aggregateByTime(analytics.data, range);
  }, [analytics, range]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Notification Volume</CardTitle>
        <div className="flex gap-1">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <Button
              key={r}
              variant={range === r ? "default" : "ghost"}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No data for this time range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-4)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-chart-4)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
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
              <Area
                type="monotone"
                dataKey="sent"
                name="Sent"
                stroke="var(--color-chart-4)"
                fill="url(#gradSent)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="delivered"
                name="Delivered"
                stroke="var(--color-chart-2)"
                fill="url(#gradDelivered)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="failed"
                name="Failed"
                stroke="var(--color-chart-1)"
                fill="url(#gradFailed)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export { DeliveryChart };
