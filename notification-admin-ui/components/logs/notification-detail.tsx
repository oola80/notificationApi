"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
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
  ScrollArea,
} from "@/components/ui";
import { StatusBadge, PageHeader, ChannelIcon } from "@/components/shared";
import { LifecycleTimeline } from "./lifecycle-timeline";
import { useNotificationTrace, useDeliveryReceipts, useProviderDeliveryAttempts } from "@/hooks/use-notifications";
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
  const { data: attemptsData, isLoading: attemptsLoading } = useProviderDeliveryAttempts(notificationId);
  const [expandedReceipts, setExpandedReceipts] = React.useState<Set<string>>(new Set());
  const [expandedAttempts, setExpandedAttempts] = React.useState<Set<string>>(new Set());

  const toggleReceipt = (id: string) => {
    setExpandedReceipts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAttempt = (id: string) => {
    setExpandedAttempts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
                        <TableHead className="w-10" />
                        <TableHead>Channel</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Provider Message ID</TableHead>
                        <TableHead>Received At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.map((receipt) => (
                        <React.Fragment key={receipt.id}>
                          <TableRow
                            className={receipt.rawResponse ? "cursor-pointer hover:bg-muted/50" : ""}
                            onClick={() => receipt.rawResponse && toggleReceipt(receipt.id)}
                          >
                            <TableCell className="w-10">
                              {receipt.rawResponse ? (
                                expandedReceipts.has(receipt.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )
                              ) : null}
                            </TableCell>
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
                          {expandedReceipts.has(receipt.id) && receipt.rawResponse && (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-muted/30 p-0">
                                <div className="p-4 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">Raw Webhook Response</span>
                                    <CopyButton value={JSON.stringify(receipt.rawResponse, null, 2)} />
                                  </div>
                                  <ScrollArea className="max-h-64">
                                    <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs">
                                      {JSON.stringify(receipt.rawResponse, null, 2)}
                                    </pre>
                                  </ScrollArea>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provider Delivery Attempts */}
          <ProviderAttemptsCard
            attempts={attemptsData?.attempts ?? []}
            isLoading={attemptsLoading}
            expandedAttempts={expandedAttempts}
            toggleAttempt={toggleAttempt}
          />

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

// --- Attempt expanded details ---

function AttemptDetails({ attempt }: { attempt: import("@/types").ProviderDeliveryAttempt }) {
  // Extract provider API payload and response from providerResponse (adapter returns { sentPayload, apiResponse })
  const providerResp = attempt.providerResponse as Record<string, unknown> | null;
  const providerSentPayload = providerResp?.sentPayload as Record<string, unknown> | undefined;
  const providerApiResponse = providerResp?.apiResponse as Record<string, unknown> | undefined;
  // If providerResponse doesn't have the sentPayload/apiResponse structure, show it as-is
  const isStructuredResponse = providerResp && ("sentPayload" in providerResp || "apiResponse" in providerResp);
  const rawProviderResponse = !isStructuredResponse ? providerResp : null;

  // Extract CRS-level sent payload from metadata (the SendRequest to the adapter)
  const crsSentPayload = (attempt.metadata as Record<string, unknown> | null)?.sentPayload as Record<string, unknown> | undefined;
  const otherMetadata = attempt.metadata
    ? Object.fromEntries(Object.entries(attempt.metadata).filter(([k]) => k !== "sentPayload"))
    : null;
  const hasOtherMetadata = otherMetadata && Object.keys(otherMetadata).length > 0;

  return (
    <div className="p-4 space-y-3">
      {providerSentPayload && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Provider API Request</span>
            <CopyButton value={JSON.stringify(providerSentPayload, null, 2)} />
          </div>
          <ScrollArea className="max-h-80">
            <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs">
              {JSON.stringify(providerSentPayload, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
      {providerApiResponse && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Provider API Response</span>
            <CopyButton value={JSON.stringify(providerApiResponse, null, 2)} />
          </div>
          <ScrollArea className="max-h-64">
            <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs">
              {JSON.stringify(providerApiResponse, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
      {rawProviderResponse && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Provider Response</span>
            <CopyButton value={JSON.stringify(rawProviderResponse, null, 2)} />
          </div>
          <ScrollArea className="max-h-64">
            <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs">
              {JSON.stringify(rawProviderResponse, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
      {attempt.errorMessage && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Error Message</span>
          <pre className="whitespace-pre-wrap rounded border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {attempt.errorMessage}
          </pre>
        </div>
      )}
      {crsSentPayload && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Adapter Request Payload</span>
            <CopyButton value={JSON.stringify(crsSentPayload, null, 2)} />
          </div>
          <ScrollArea className="max-h-64">
            <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs">
              {JSON.stringify(crsSentPayload, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
      {hasOtherMetadata && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Metadata</span>
            <CopyButton value={JSON.stringify(otherMetadata, null, 2)} />
          </div>
          <ScrollArea className="max-h-48">
            <pre className="whitespace-pre-wrap rounded border bg-muted/50 p-3 text-xs">
              {JSON.stringify(otherMetadata, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// --- Provider delivery attempts card ---

function ProviderAttemptsCard({
  attempts,
  isLoading,
  expandedAttempts,
  toggleAttempt,
}: {
  attempts: import("@/types").ProviderDeliveryAttempt[];
  isLoading: boolean;
  expandedAttempts: Set<string>;
  toggleAttempt: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Provider Delivery Attempts
          {!isLoading && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({attempts.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : attempts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No delivery attempts recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Attempt</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Provider Message ID</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => {
                  const hasDetails = attempt.providerResponse || attempt.errorMessage || attempt.metadata;
                  return (
                    <React.Fragment key={attempt.id}>
                      <TableRow
                        className={hasDetails ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => hasDetails && toggleAttempt(attempt.id)}
                      >
                        <TableCell className="w-10">
                          {hasDetails ? (
                            expandedAttempts.has(attempt.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          #{attempt.attemptNumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ChannelIcon channel={attempt.channel} size={14} />
                            <span className="capitalize">{attempt.channel}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={attempt.status} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {attempt.providerMessageId
                            ? truncate(attempt.providerMessageId, 20)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {attempt.durationMs != null ? `${attempt.durationMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(attempt.attemptedAt)}
                        </TableCell>
                      </TableRow>
                      {expandedAttempts.has(attempt.id) && hasDetails && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <AttemptDetails attempt={attempt} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
