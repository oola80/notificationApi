"use client";

import { PageHeader } from "@/components/shared";
import { ConfigEditor } from "@/components/settings";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Configuration"
        description="Manage global platform settings, feature flags, and rate limits"
      />
      <ConfigEditor />
    </div>
  );
}
