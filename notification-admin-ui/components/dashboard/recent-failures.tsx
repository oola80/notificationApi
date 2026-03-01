"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui";
import { Button } from "@/components/ui";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui";
import { useNotificationLogs } from "@/hooks/use-notifications";
import { formatRelativeTime, truncate } from "@/lib/formatters";
import { ChannelIcon } from "@/components/shared";

function RecentFailures() {
  const { data: logsResponse, isLoading } = useNotificationLogs({
    eventType: "delivery.failed",
    pageSize: 10,
  });

  const failures = logsResponse?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Recent Failures</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/logs?eventType=delivery.failed">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : failures.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No recent failures
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Notification</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Link
                        href={`/logs/${entry.notificationId ?? entry.id}`}
                        className="text-primary hover:underline font-mono text-xs"
                      >
                        {truncate(entry.notificationId ?? entry.id, 12)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.eventType}
                    </TableCell>
                    <TableCell>
                      {entry.metadata?.channel ? (
                        <span className="flex items-center gap-1">
                          <ChannelIcon channel={String(entry.metadata.channel)} size={14} />
                          <span className="text-xs">{String(entry.metadata.channel)}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                      {truncate(String(entry.metadata?.error ?? entry.metadata?.reason ?? "Unknown error"), 40)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(entry.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { RecentFailures };
