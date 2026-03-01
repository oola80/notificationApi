export type ServiceName =
  | "eventIngestion"
  | "notificationEngine"
  | "template"
  | "channelRouter"
  | "admin"
  | "audit"
  | "bulkUpload";

const SERVICE_URLS: Record<ServiceName, string> = {
  eventIngestion:
    process.env.NEXT_PUBLIC_EVENT_INGESTION_URL ?? "http://localhost:3151",
  notificationEngine:
    process.env.NEXT_PUBLIC_NOTIFICATION_ENGINE_URL ?? "http://localhost:3152",
  template:
    process.env.NEXT_PUBLIC_TEMPLATE_SERVICE_URL ?? "http://localhost:3153",
  channelRouter:
    process.env.NEXT_PUBLIC_CHANNEL_ROUTER_URL ?? "http://localhost:3154",
  admin: process.env.NEXT_PUBLIC_ADMIN_SERVICE_URL ?? "http://localhost:3155",
  audit: process.env.NEXT_PUBLIC_AUDIT_SERVICE_URL ?? "http://localhost:3156",
  bulkUpload:
    process.env.NEXT_PUBLIC_BULK_UPLOAD_URL ?? "http://localhost:3158",
};

export function getServiceUrl(service: ServiceName): string {
  return SERVICE_URLS[service];
}
