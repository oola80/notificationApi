"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { PageHeader } from "@/components/shared";
import { AuditLogViewer, DlqViewer } from "@/components/audit";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="View audit logs, search events, and manage dead letter queue entries."
      />
      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Audit Logs</TabsTrigger>
          <TabsTrigger value="dlq">Dead Letter Queue</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <AuditLogViewer />
        </TabsContent>
        <TabsContent value="dlq">
          <DlqViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
