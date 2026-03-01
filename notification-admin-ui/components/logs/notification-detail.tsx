"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { StatusBadge, PageHeader, ChannelIcon } from "@/components/shared";
import { LifecycleTimeline } from "./lifecycle-timeline";
import { useNotificationTrace, useDeliveryReceipts } from "@/hooks/use-notifications";
import { formatDate, truncate } from "@/lib/formatters";

// --- Copy button helper ---

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center text-muted-foreground hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// --- Metadata row ---

function MetaRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: React.ReactNode;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right flex items-center gap-1">
        {value}
        {copyable && typeof value === "string" && <CopyButton value={value} />}
      </dd>
    </div>
  );
}

// --- Loading skeleton ---

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

// --- Main component ---

interface NotificationDetailProps {
  notificationId: string;
}

function NotificationDetail({ notificationId }: NotificationDetailProps) {
  const { data: trace, isLoading: traceLoading, error: traceError } = useNotificationTrace(notificationId);
  const { data: receiptsData, isLoading: receiptsLoading } = useDeliveryReceipts(notificationId);

  if (traceLoading) return <DetailSkeleton />;

  if (traceError || !trace) {
    return (
      <div className="space-y-4">
        <Link href="/logs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Logs
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="font-medium">Failed to load notification</p>
          <p className="text-sm text-muted-foreground">
            {traceError?.message ?? "Notification not found"}
          </p>
        </div>
      </div>
    );
  }

  const { summary, timeline } = trace;
  const receipts = receiptsData?.receipts ?? [];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex flex-col gap-4">
        <Link href="/logs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Logs
          </Button>
        </Link>
        <PageHeader
          title={`Notification ${truncate(notificationId, 12)}`}
          description="Full lifecycle trace from ingestion to delivery"
          actions={
            summary.finalStatus ? (
              <StatusBadge status={summary.finalStatus} />
            ) : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Timeline + Receipts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lifecycle Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lifecycle Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <LifecycleTimeline entries={timeline} />
            </CardContent>
          </Card>

          {/* Delivery Receipts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Delivery Receipts
                {!receiptsLoading && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({receipts.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {receiptsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : receipts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No delivery receipts yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Provider Message ID</TableHead>
                        <TableHead>Received At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <ChannelIcon channel={receipt.channel} size={14} />
                              <span className="capitalize">{receipt.channel}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {receipt.provider}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={receipt.status} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {receipt.providerMessageId
                              ? truncate(receipt.providerMessageId, 20)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatDate(receipt.receivedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rendered Content Preview */}
          <RenderedContentPreview timeline={timeline} />
        </div>

        {/* Right sidebar: Metadata */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <MetaRow
                  label="Notification ID"
                  value={truncate(summary.notificationId, 16)}
                  copyable
                />
                {summary.channel && (
                  <MetaRow
                    label="Channel"
                    value={
                      <span className="flex items-center gap-1.5 capitalize">
                        <ChannelIcon channel={summary.channel} size={14} />
                        {summary.channel}
                      </span>
                    }
                  />
                )}
                {summary.finalStatus && (
                  <MetaRow
                    label="Status"
                    value={<StatusBadge status={summary.finalStatus} />}
                  />
                )}
                <MetaRow
                  label="Events"
                  value={String(summary.eventCount)}
                />
                <MetaRow
                  label="Receipts"
                  value={String(summary.receiptCount)}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identifiers</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <MetaRow
                  label="Notification ID"
                  value={summary.notificationId}
                  copyable
                />
                {summary.correlationId && (
                  <MetaRow
                    label="Correlation ID"
                    value={summary.correlationId}
                    copyable
                  />
                )}
                {summary.cycleId && (
                  <MetaRow
                    label="Cycle ID"
                    value={summary.cycleId}
                    copyable
                  />
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Timeline timestamps */}
          {timeline.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timestamps</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  <MetaRow
                    label="First Event"
                    value={formatDate(timeline[0].timestamp)}
                  />
                  <MetaRow
                    label="Last Event"
                    value={formatDate(timeline[timeline.length - 1].timestamp)}
                  />
                  {timeline.length >= 2 && (
                    <MetaRow
                      label="Duration"
                      value={calculateDuration(
                        timeline[0].timestamp,
                        timeline[timeline.length - 1].timestamp,
                      )}
                    />
                  )}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Rendered content preview ---

function RenderedContentPreview({
  timeline,
}: {
  timeline: import("@/types").TraceTimelineEntry[];
}) {
  // Extract rendered content from timeline metadata (if any render event has it)
  const renderEvent = timeline.find(
    (e) =>
      e.eventType.toLowerCase().includes("render") &&
      e.metadata?.renderedContent,
  );

  if (!renderEvent?.metadata?.renderedContent) return null;

  const content = renderEvent.metadata.renderedContent as Record<string, unknown>;
  const subject = content.subject ? String(content.subject) : null;
  const html = content.html ? String(content.html) : null;
  const text = content.text ? String(content.text) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rendered Content</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="raw">
          <TabsList>
            {subject && <TabsTrigger value="subject">Subject</TabsTrigger>}
            {html && <TabsTrigger value="html">HTML</TabsTrigger>}
            {text && <TabsTrigger value="text">Text</TabsTrigger>}
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          {subject && (
            <TabsContent value="subject">
              <p className="text-sm">{subject}</p>
            </TabsContent>
          )}
          {html && (
            <TabsContent value="html">
              <div
                className="prose prose-sm max-w-none rounded border p-4"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </TabsContent>
          )}
          {text && (
            <TabsContent value="text">
              <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-4 text-xs">
                {text}
              </pre>
            </TabsContent>
          )}
          <TabsContent value="raw">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded border bg-muted/50 p-4 text-xs">
              {JSON.stringify(content, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// --- Helpers ---

function calculateDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export { NotificationDetail };
export type { NotificationDetailProps };
