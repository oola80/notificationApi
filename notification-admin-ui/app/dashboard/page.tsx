"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui";
import {
  SummaryCards,
  DeliveryChart,
  ChannelBreakdown,
  RecentFailures,
  TopRules,
} from "@/components/dashboard";
import { useDashboardSummary, useTriggerAggregation } from "@/hooks/use-dashboard";

export default function DashboardPage() {
  const { data: summary, isLoading, error } = useDashboardSummary();
  const { trigger: triggerAggregation, isMutating: isAggregating } = useTriggerAggregation();

  const handleRefreshAnalytics = async () => {
    try {
      await triggerAggregation({});
      toast.success("Analytics refreshed successfully");
    } catch {
      toast.error("Failed to refresh analytics");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Dashboard"
          description="Metrics, charts, channel health, and recent activity."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAnalytics}
          disabled={isAggregating}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isAggregating ? "animate-spin" : ""}`} />
          {isAggregating ? "Refreshing..." : "Refresh Analytics"}
        </Button>
      </div>

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
