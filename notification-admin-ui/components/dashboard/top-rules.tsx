"use client";

import * as React from "react";
import Link from "next/link";
import { subDays, startOfDay, formatISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui";
import { useAnalytics } from "@/hooks/use-dashboard";
import { useRules } from "@/hooks/use-rules";
import { formatNumber } from "@/lib/formatters";

interface TopEventType {
  eventType: string;
  triggerCount: number;
  ruleId?: string;
  ruleName?: string;
}

function TopRules() {
  const now = new Date();
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics({
    period: "daily",
    from: formatISO(startOfDay(subDays(now, 7))),
    to: formatISO(now),
    channel: "_all",
    pageSize: 200,
  });

  const { data: rulesResponse, isLoading: rulesLoading } = useRules({ limit: 100 });

  const topEventTypes = React.useMemo<TopEventType[]>(() => {
    if (!analytics?.data) return [];

    // Aggregate totalSent by eventType across the 7d period
    const eventMap = new Map<string, number>();
    for (const point of analytics.data) {
      if (!point.eventType) continue;
      eventMap.set(
        point.eventType,
        (eventMap.get(point.eventType) ?? 0) + point.totalSent,
      );
    }

    // Build a rule lookup by eventType
    const ruleByEvent = new Map<string, { id: string; name: string }>();
    const rules = (rulesResponse as { data?: Array<{ id: string; name: string; eventType: string }> })?.data ?? [];
    for (const rule of rules) {
      if (rule.eventType) {
        ruleByEvent.set(rule.eventType, { id: rule.id, name: rule.name });
      }
    }

    // Build top 5 list
    return Array.from(eventMap.entries())
      .map(([eventType, triggerCount]) => {
        const rule = ruleByEvent.get(eventType);
        return {
          eventType,
          triggerCount,
          ruleId: rule?.id,
          ruleName: rule?.name,
        };
      })
      .sort((a, b) => b.triggerCount - a.triggerCount)
      .slice(0, 5);
  }, [analytics, rulesResponse]);

  const isLoading = analyticsLoading || rulesLoading;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Top Rules (7d)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : topEventTypes.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No data for the last 7 days
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule / Event Type</TableHead>
                <TableHead className="text-right">Triggers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topEventTypes.map((item) => (
                <TableRow key={item.eventType}>
                  <TableCell>
                    {item.ruleId ? (
                      <Link
                        href={`/rules/${item.ruleId}`}
                        className="text-primary hover:underline text-sm"
                      >
                        {item.ruleName}
                      </Link>
                    ) : (
                      <span className="text-sm">{item.eventType}</span>
                    )}
                    <p className="text-xs text-muted-foreground">{item.eventType}</p>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(item.triggerCount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export { TopRules };
