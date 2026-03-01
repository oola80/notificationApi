"use client";

import Link from "next/link";
import {
  Send,
  CheckCircle2,
  XCircle,
  BarChart3,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { Skeleton } from "@/components/ui";
import { formatNumber, formatPercentage } from "@/lib/formatters";
import type { DashboardSummary } from "@/types";

interface SummaryCardsProps {
  summary: DashboardSummary | undefined;
  isLoading: boolean;
}

interface MetricCardProps {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: React.ReactNode;
  trend?: { value: number; label: string };
  href?: string;
}

function MetricCard({ icon: Icon, iconColor, label, value, trend, href }: MetricCardProps) {
  const content = (
    <Card className="transition-colors hover:bg-accent/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                {trend.value >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={trend.value >= 0 ? "text-green-600" : "text-red-600"}>
                  {trend.value >= 0 ? "+" : ""}
                  {trend.value.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={`rounded-md p-2 ${iconColor}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function computeTrend(todayValue: number, weekValue: number): { value: number; label: string } | undefined {
  if (weekValue === 0) return undefined;
  const dailyAvg = weekValue / 7;
  if (dailyAvg === 0) return undefined;
  const pctChange = ((todayValue - dailyAvg) / dailyAvg) * 100;
  return { value: pctChange, label: "vs 7d avg" };
}

function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const { today, last7Days, channelBreakdown } = summary;

  const sentTrend = computeTrend(today.totalSent, last7Days.totalSent);

  const deliveryRateColor =
    today.deliveryRate >= 95
      ? "text-green-600"
      : today.deliveryRate >= 85
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        icon={Send}
        iconColor="bg-indigo-500"
        label="Total Sent (Today)"
        value={formatNumber(today.totalSent)}
        trend={sentTrend}
      />
      <MetricCard
        icon={CheckCircle2}
        iconColor="bg-green-500"
        label="Delivery Rate"
        value={
          <span className={deliveryRateColor}>
            {formatPercentage(today.deliveryRate)}
          </span>
        }
        trend={
          last7Days.deliveryRate > 0
            ? {
                value: today.deliveryRate - last7Days.deliveryRate,
                label: "vs 7d avg",
              }
            : undefined
        }
      />
      <MetricCard
        icon={XCircle}
        iconColor="bg-red-500"
        label="Failed (Today)"
        value={formatNumber(today.totalFailed)}
        href="/logs?status=failed"
      />
      <MetricCard
        icon={BarChart3}
        iconColor="bg-purple-500"
        label="Active Channels"
        value={String(channelBreakdown.length)}
        href="/channels"
      />
    </div>
  );
}

export { SummaryCards };
export type { SummaryCardsProps };
