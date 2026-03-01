"use client";

import { useParams } from "next/navigation";
import { NotificationDetail } from "@/components/logs";

export default function LogDetailPage() {
  const params = useParams<{ id: string }>();
  return <NotificationDetail notificationId={params.id} />;
}
