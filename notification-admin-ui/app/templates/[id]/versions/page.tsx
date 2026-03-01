"use client";

import * as React from "react";
import { VersionHistory } from "@/components/templates";

export default function TemplateVersionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  return <VersionHistory templateId={id} />;
}
