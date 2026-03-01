"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui";
import { ScrollArea } from "@/components/ui";
import type { AuditEvent } from "@/types";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 gap-1 px-1.5 text-xs"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {label}
    </Button>
  );
}

interface AuditDetailRowProps {
  event: AuditEvent;
}

function AuditDetailRow({ event }: AuditDetailRowProps) {
  return (
    <div className="space-y-4 p-4 bg-muted/30 border-t">
      {/* IDs with copy buttons */}
      <div className="flex flex-wrap gap-4 text-sm">
        {event.id && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">ID:</span>
            <code className="font-mono text-xs">{event.id}</code>
            <CopyButton value={event.id} label="Copy" />
          </div>
        )}
        {event.notificationId && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Notification:</span>
            <code className="font-mono text-xs">{event.notificationId}</code>
            <CopyButton value={event.notificationId} label="Copy" />
          </div>
        )}
        {event.correlationId && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Correlation:</span>
            <code className="font-mono text-xs">{event.correlationId}</code>
            <CopyButton value={event.correlationId} label="Copy" />
          </div>
        )}
        {event.cycleId && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Cycle:</span>
            <code className="font-mono text-xs">{event.cycleId}</code>
            <CopyButton value={event.cycleId} label="Copy" />
          </div>
        )}
      </div>

      {/* Metadata */}
      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">Metadata</h4>
          <ScrollArea className="max-h-48 rounded-md border bg-background p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}

      {/* Payload Snapshot */}
      {event.payloadSnapshot && Object.keys(event.payloadSnapshot).length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">Payload Snapshot</h4>
          <ScrollArea className="max-h-48 rounded-md border bg-background p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(event.payloadSnapshot, null, 2)}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export { AuditDetailRow };
export type { AuditDetailRowProps };
