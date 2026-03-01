// --- /audit/analytics/summary response ---

export interface DashboardSummary {
  today: DaySummary;
  last7Days: WeekSummary;
  channelBreakdown: ChannelBreakdownItem[];
}

export interface DaySummary {
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
  totalFailed: number;
  failureRate: number;
}

export interface WeekSummary {
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
  avgLatencyMs: number | null;
}

export interface ChannelBreakdownItem {
  channel: string;
  totalSent: number;
  totalDelivered: number;
  deliveryRate: number;
}

// --- /audit/analytics response ---

export interface AnalyticsDataPoint {
  id: string;
  period: "hourly" | "daily";
  periodStart: string;
  channel: string;
  eventType: string | null;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalSuppressed: number;
  avgLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsResponse {
  data: AnalyticsDataPoint[];
  meta: AnalyticsMeta;
}

export interface AnalyticsMeta {
  period: string;
  from: string;
  to: string;
  totalRecords: number;
}

export interface AnalyticsQueryParams {
  period?: "hourly" | "daily";
  from: string;
  to: string;
  channel?: string;
  eventType?: string;
  page?: number;
  pageSize?: number;
}
