"use client";

import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared";
import {
  SummaryCards,
  DeliveryChart,
  ChannelBreakdown,
  RecentFailures,
  TopRules,
} from "@/components/dashboard";
import { useDashboardSummary } from "@/hooks/use-dashboard";

export default function DashboardPage() {
  const { data: summary, isLoading, error } = useDashboardSummary();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Metrics, charts, channel health, and recent activity."
      />

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Some metrics are temporarily unavailable. Dashboard will retry
            automatically.
          </span>
        </div>
      )}

      <SummaryCards summary={summary} isLoading={isLoading} />

      <DeliveryChart />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChannelBreakdown
          data={summary?.channelBreakdown}
          isLoading={isLoading}
        />
        <TopRules />
      </div>

      <RecentFailures />
    </div>
  );
}
