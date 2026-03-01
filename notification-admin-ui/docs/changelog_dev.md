# Notification Admin UI — Development Changelog

> **Info:** This changelog tracks **code changes only**.
> Design changes are tracked in the root `docs/06-changelog.md`.

## [Unreleased]

### Fix: Frontend-to-backend API call mismatches (2026-03-01)

- `hooks/use-mappings.ts` — Changed `pageSize` → `limit` in params to match EIS `ListEventMappingsQueryDto`. Removed `sortBy`, `sortOrder`, `search` params (not supported by backend DTO, rejected by `forbidNonWhitelisted`).
- `components/mappings/mapping-list.tsx` — Updated `useMappings` call to pass `limit: pageSize` instead of `pageSize`, removed `search`/`sortBy`/`sortOrder` from API params (retained as local DataTable UI state).
- `hooks/use-channels.ts` — Fixed 3 path mismatches:
  - `useUpdateChannel`: `/api/v1/channels/${id}` → `/api/v1/channels/${id}/config` (backend expects `/config` suffix)
  - `useRegisterProvider`: `/api/v1/providers` → `/api/v1/providers/register` (backend expects `/register` suffix)
  - `useUpdateProvider`: `/api/v1/providers/${id}` → `/api/v1/providers/${id}/config` (backend expects `/config` suffix)
- `hooks/use-recipient-groups.ts` — Removed `search` param from `useRecipientGroups` (not in backend `ListRecipientGroupsQueryDto`, rejected by `forbidNonWhitelisted`).
- `components/recipient-groups/group-list.tsx` — Removed `search` from `useRecipientGroups` call.

### Phase 13 — Audit Trail, DLQ Viewer & Polish (2026-02-28)

**New files:**
- `hooks/use-audit.ts` — Domain-specific SWR hooks for audit trail and DLQ management: `useAuditLogs(params?)` (paginated audit event logs with filters for notificationId, correlationId, cycleId, eventType, actor, date range, full-text query), `useAuditSearch(query, params?)` (full-text search via `/audit/search` endpoint, enabled only when query is non-empty), `useDlqEntries(params?)` (paginated DLQ list with status, queue, and date range filters; response includes statusCounts in meta), `useUpdateDlqStatus()` (PATCH DLQ entry status with state machine validation), `useReprocessDlq()` (POST reprocess DLQ entry, republishes to original exchange), `useCsvExport()` (fetches all pages of audit logs and generates client-side CSV download). All delegate to `useApiGet`/`useApiMutation` or direct `apiClient` calls targeting audit-service (:3156) at `/audit/logs`, `/audit/search`, `/audit/dlq`.
- `components/audit/audit-log-viewer.tsx` — `AuditLogViewer` component: full audit log page with filter bar and expandable-row data table. Filters: full-text SearchInput (switches to `/audit/search` endpoint when query >= 2 chars), event type select (8 common event types), actor text input, DateRangePicker. Table columns: expand chevron, timestamp, event type (Badge), actor, notification ID (truncated monospace), correlation ID (truncated monospace), status from metadata. Clicking a row expands it to show `AuditDetailRow` with full metadata and payload JSON. CSV export button in toolbar. Refresh button. Clear filters button. Pagination with page size selector.
- `components/audit/audit-detail-row.tsx` — `AuditDetailRow` component: expanded row content showing all IDs (event ID, notification ID, correlation ID, cycle ID) with copy-to-clipboard buttons. Formatted JSON viewer for metadata and payload snapshot in scrollable containers.
- `components/audit/csv-export.tsx` — `CsvExportButton` component: export button with loading spinner. Uses `useCsvExport` hook to fetch all matching pages and generate CSV client-side. Downloads as `audit-export-{timestamp}.csv`. Toast notifications on success/error.
- `components/audit/dlq-viewer.tsx` — `DlqViewer` component: DataTable showing DLQ entries with 6 columns (ID truncated, queue monospace, error message truncated, status via StatusBadge, retry count, captured date). Status filter select. Status count badges showing pending/investigated/reprocessed/discarded totals. Row actions: Investigate (pending → investigated), Reprocess (investigated → reprocessed, with confirmation dialog), Discard (with confirmation dialog). State machine validation for allowed transitions (`DLQ_TRANSITIONS` from types). ConfirmDialog for destructive actions. Refresh button.
- `components/audit/index.ts` — Barrel export for AuditLogViewer, AuditDetailRow, CsvExportButton, DlqViewer with type exports
- `components/shared/error-boundary.tsx` — React class-based error boundary component with error message display and "Try again" reset button. Exported via shared barrel.
- `app/error.tsx` — Global Next.js error boundary for the entire application
- `app/{route}/error.tsx` — Per-route Next.js error boundaries for all 10 route groups (dashboard, rules, templates, channels, logs, event-mappings, bulk-upload, recipient-groups, audit, settings)
- `app/loading.tsx` — Global Next.js loading state using PageSkeleton component
- `app/{route}/loading.tsx` — Per-route Next.js loading states for all 10 route groups using PageSkeleton
- `app/{route}/layout.tsx` — Per-route layout files for all 10 route groups exporting Next.js metadata (page titles via title template)

**Modified files:**
- `types/audit.ts` — Replaced scaffolded `DlqEntry` with full audit-service API response types: `DlqStatus` union type (pending/investigated/reprocessed/discarded), `DlqEntry` (id, originalQueue, originalExchange, originalRoutingKey, rejectionReason, retryCount, payload, xDeathHeaders, status, notes, capturedAt, resolvedAt, resolvedBy), `DlqStatusCounts`, `DlqListMeta` (with statusCounts), `DlqListResponse`, `DlqSearchParams`, `UpdateDlqStatusDto`, `ReprocessDlqDto`, `ReprocessDlqResponse`, `DLQ_TRANSITIONS` state machine constant
- `components/shared/status-badge.tsx` — Added DLQ status variants: `investigated` → outline, `reprocessed` → success, `discarded` → secondary
- `components/shared/index.ts` — Added ErrorBoundary to barrel export
- `app/audit/page.tsx` — Replaced placeholder with tabbed layout (Radix Tabs): "Audit Logs" tab renders `AuditLogViewer`, "Dead Letter Queue" tab renders `DlqViewer`. Uses PageHeader with title and description.
- `app/layout.tsx` — Updated metadata to use title template (`%s | Notification Admin UI`) for per-page titles

**Removed files:**
- `app/test-components/page.tsx` — Removed temporary test components page (Phase 2/4 visual verification, no longer needed)

### Phase 12 — Dashboard & Analytics Module (2026-02-28)

**New dependency:**
- recharts ^2 (charting library for area, bar, and pie charts)

**New files:**
- `hooks/use-dashboard.ts` — Domain-specific SWR hooks for dashboard analytics: `useDashboardSummary()` (GET `/audit/analytics/summary` with 30s auto-polling via `refreshInterval`), `useAnalytics(params?)` (GET `/audit/analytics` with period, date range, channel, and event type filters; enabled only when from/to params are provided). Both target audit-service (:3156).
- `components/dashboard/summary-cards.tsx` — `SummaryCards` component: row of 4 metric cards showing Total Sent (today) with trend vs 7d average, Delivery Rate with color coding (green >=95%, yellow >=85%, red <85%) and trend delta vs 7d, Failed count (today) linking to `/logs?status=failed`, Active Channels count linking to `/channels`. Each card has colored icon, large value, and optional trend indicator (up/down arrow with percentage). `MetricCardSkeleton` for loading state. `computeTrend()` utility comparing today's value against 7-day daily average.
- `components/dashboard/delivery-chart.tsx` — `DeliveryChart` component: Recharts `AreaChart` showing notification volume over time. Time range selector (24h/7d/30d) controls period (hourly vs daily) and date range. Three area series: Sent (purple), Delivered (green), Failed (red) with gradient fills. Filters analytics data for `channel=_all` aggregate totals. Formatted axis labels (HH:mm for hourly, MMM d for daily). Tooltip with formatted numbers. Responsive container. Loading skeleton and empty state.
- `components/dashboard/channel-breakdown.tsx` — `ChannelBreakdown` component: Recharts stacked `BarChart` showing per-channel delivery breakdown from summary data. Bars: delivered (color-coded per channel — email purple, sms green, whatsapp orange, push pink) + failed (red) stacked. Formatted axis and tooltip. Loading skeleton and empty state.
- `components/dashboard/recent-failures.tsx` — `RecentFailures` component: Card with table of 10 most recent failed notifications. Fetches from `/audit/logs?eventType=delivery.failed&pageSize=10` via `useNotificationLogs`. Columns: notification ID (truncated UUID, link to `/logs/:id`), event type, channel (with `ChannelIcon`), error message (truncated), relative time. "View All" link to `/logs?eventType=delivery.failed`. Loading skeleton and empty state.
- `components/dashboard/top-rules.tsx` — `TopRules` component: Card with table of top 5 most-triggered rules over 7 days. Aggregates `totalSent` by `eventType` from `/audit/analytics` (daily, last 7d, channel=_all). Cross-references with rules list from `useRules()` to resolve rule names and IDs. Columns: rule name (link to `/rules/:id`) with event type subtitle, trigger count. Loading skeleton and empty state.
- `components/dashboard/index.ts` — Barrel export for SummaryCards, DeliveryChart, ChannelBreakdown, RecentFailures, TopRules with type exports

**Modified files:**
- `types/dashboard.ts` — Replaced scaffolded types with actual audit-service API response types: `DashboardSummary` (today, last7Days, channelBreakdown), `DaySummary` (totalSent, totalDelivered, deliveryRate, totalFailed, failureRate), `WeekSummary` (totalSent, totalDelivered, deliveryRate, avgLatencyMs), `ChannelBreakdownItem` (channel, totalSent, totalDelivered, deliveryRate), `AnalyticsDataPoint` (full pre-aggregated row with period, periodStart, channel, eventType, all metric columns), `AnalyticsResponse` (data + meta), `AnalyticsMeta` (period, from, to, totalRecords), `AnalyticsQueryParams` (period, from, to, channel, eventType, page, pageSize)
- `app/dashboard/page.tsx` — Replaced placeholder with full dashboard layout: PageHeader, degradation warning banner (shown on error), SummaryCards, DeliveryChart (full width), ChannelBreakdown + TopRules (side by side 2-column grid), RecentFailures at bottom. Uses `useDashboardSummary` hook for summary data with 30s auto-refresh. All sections have independent loading states.

### Phase 11 — Recipient Groups & Settings Modules (2026-02-28)

**New files:**
- `hooks/use-recipient-groups.ts` — Domain-specific SWR hooks for recipient groups: `useRecipientGroups(params?)` (paginated list with isActive and search filters), `useRecipientGroup(id)` (single detail with members), `useCreateRecipientGroup()`, `useUpdateRecipientGroup(id)`, `useDeleteRecipientGroup(id)`, `useRecipientGroupMembers(groupId)` (member list), `useAddRecipientGroupMember(groupId)` (POST add member), `useRemoveRecipientGroupMember(groupId, memberId)` (DELETE remove member). All delegate to `useApiGet`/`useApiMutation` targeting notification-engine-service (:3152) at `/api/v1/recipient-groups` with appropriate cache invalidation keys.
- `hooks/use-settings.ts` — Domain-specific SWR hooks for system configuration: `useSystemConfigs()` (list all configs), `useUpdateSystemConfig(key)` (PUT update config value). Targeting admin-service (:3155) at `/api/v1/system-configs`.
- `lib/validators/recipient-group-schemas.ts` — Zod validation schemas: `createRecipientGroupSchema` (name required max 255, description optional, isActive boolean), `addMemberSchema` (email required + valid email, memberName optional, phone optional, deviceToken optional). Exported form data types: `CreateRecipientGroupFormData`, `AddMemberFormData`.
- `components/recipient-groups/group-list.tsx` — `GroupList` component: DataTable with 4 columns (name, member count, status via StatusBadge, created date); 2 filter controls (search input, status select); 2 row actions (Edit, Delete with ConfirmDialog); pagination with page size selector; empty state with create button; error state with retry. Click row navigates to detail page.
- `components/recipient-groups/group-form.tsx` — `GroupForm` component: React Hook Form + Zod validation with 1 Card section (Group Details). Fields: name (text input), description (textarea), isActive (switch toggle). Reusable for create and edit modes via `isEditing` prop. Back navigation to `/recipient-groups`. Cancel and submit buttons with loading spinner.
- `components/recipient-groups/member-manager.tsx` — `MemberManager` component: Card with member count header, "Add Member" toggle button. Inline add form with 4 fields (email, name, phone, device token) in 2-column grid, cancel/add buttons. Members table with 5 columns (name, email monospace, phone, added date, remove button). Remove member with ConfirmDialog. Empty state with add prompt. Loading state with spinner.
- `components/recipient-groups/index.ts` — Barrel export for GroupList, GroupForm, MemberManager
- `components/settings/config-editor.tsx` — `ConfigEditor` component: Groups configs by category prefix (text before first dot). Each category rendered as a Card with formatted title. Per-config row with key (monospace), description, last updated date, type-aware input (boolean → Switch toggle, number → number input, text → text input), per-row Save button (enabled only when value is dirty). Direct API call via `apiClient.put` for individual saves with toast notifications. Loading, error, and empty states.
- `components/settings/index.ts` — Barrel export for ConfigEditor

**Modified files:**
- `app/recipient-groups/page.tsx` — Replaced placeholder with `GroupList` component (full CRUD list view)
- `app/recipient-groups/new/page.tsx` — Replaced placeholder with `GroupForm` in create mode, `useCreateRecipientGroup` hook, toast notifications on success/error, redirect to detail page on create
- `app/recipient-groups/[id]/page.tsx` — Replaced placeholder with `GroupForm` in edit mode + `MemberManager`, `useRecipientGroup(id)` for data loading, `useUpdateRecipientGroup(id)` hook, loading spinner and error/not-found empty states
- `app/settings/page.tsx` — Replaced placeholder with `PageHeader` + `ConfigEditor` component

### Phase 10 — Bulk Upload Module (2026-02-28)

**New files:**
- `hooks/use-bulk-upload.ts` — Domain-specific SWR hooks for bulk upload: `useUploads(params?)` (paginated list with status, uploadedBy, date range filters), `useUpload(id)` (single upload detail), `useUploadStatus(id)` (polling with 5s refreshInterval while active), `useCreateUpload()` (custom multipart/form-data upload via FormData, bypasses JSON api-client), `useRetryUpload(id)` (POST retry with cache invalidation), `useDeleteUpload(id)` (DELETE with cache invalidation), `useDownloadResult(id, fileName?)` (binary XLSX download via blob URL + anchor click), `useUploadErrors(id, params?)` (paginated failed row details). All delegate to `useApiGet`/`useApiMutation` targeting bulk-upload-service (:3158) at `/api/v1/uploads`.
- `components/bulk-upload/progress-bar.tsx` — `ProgressBar` component: animated progress bar with percentage label. Color changes based on upload status (blue for queued/processing, green for completed, red for failed, orange for partial, gray for cancelled). Pulse animation while processing. Clamped 0-100% with smooth transition.
- `components/bulk-upload/upload-zone.tsx` — `UploadZone` component: drag-and-drop file zone using native HTML5 drag events. Visual feedback: drag-over highlight with primary border/background. File type validation (.xlsx only), file size validation (max from `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` env var, default 10 MB). Row count validation message (max from `NEXT_PUBLIC_MAX_UPLOAD_ROWS`, default 5,000). Click to browse alternative via hidden file input. Shows selected file name, size, and file icon before upload. Upload button triggers POST multipart/form-data. Clear button to deselect. Validation error display with AlertCircle icon. Toast notifications on success/failure.
- `components/bulk-upload/upload-history.tsx` — `UploadHistory` component: DataTable showing past uploads with 5 columns (file name, status via StatusBadge, total rows, success/fail counts with color coding, uploaded date). 4 row actions (View Detail navigation, Download Result XLSX, Retry failed rows, Delete with ConfirmDialog). Auto-refresh: polls upload list every 5s when any upload is in queued/processing state. Inline download and retry helper functions using direct fetch calls.
- `components/bulk-upload/upload-detail.tsx` — `UploadDetail` component: full upload detail page. Summary cards grid (status badge, total rows, succeeded count in green, failed count in red). Progress bar with percentage and processing timestamps. Status polling via `useUploadStatus` with 5s refreshInterval while status is queued/processing. Error rows section: DataTable of failed rows with row number, error message, and raw row data JSON. Action buttons: Download Result XLSX (when completed/partial with result file ready), Retry Failed Rows (when failed/partial). Details card with upload ID (monospace), file size, upload date, last updated, uploaded by. Back navigation to `/bulk-upload`. Loading skeleton. Error state with back link.
- `components/bulk-upload/index.ts` — Barrel export for UploadZone, UploadHistory, UploadDetail, ProgressBar with type exports

**Modified files:**
- `components/shared/status-badge.tsx` — Added `queued` status to STATUS_MAP (mapped to "warning" variant) for bulk upload queue state display
- `app/bulk-upload/page.tsx` — Replaced placeholder with `UploadZone` + `UploadHistory` composition (upload zone at top, history table below)
- `app/bulk-upload/[id]/page.tsx` — Replaced placeholder with `UploadDetail` component using `use(params)` for dynamic upload ID

### Phase 9 — Notification Logs, Search & Trace Module (2026-02-28)

**New files:**
- `hooks/use-notifications.ts` — Domain-specific SWR hooks for notification logs, search, and trace: `useNotificationLogs(params?)` (paginated audit event logs with filters for notificationId, correlationId, cycleId, eventType, actor, date range, full-text query), `useNotificationSearch(query, params?)` (full-text search via `/audit/search` endpoint, enabled only when query is non-empty), `useNotificationTrace(notificationId)` (single notification lifecycle trace with summary and timeline), `useCorrelationTrace(correlationId)` (all notifications by correlation ID), `useCycleTrace(cycleId)` (all notifications by business cycle ID), `useDeliveryReceipts(notificationId)` (delivery receipts for a notification). All delegate to `useApiGet` targeting audit-service (:3156) at `/audit/logs`, `/audit/search`, `/audit/trace`, `/audit/receipts`.
- `components/logs/lifecycle-timeline.tsx` — `LifecycleTimeline` component: vertical timeline visualization of notification lifecycle events. Each node has color-coded icon (green CheckCircle2 for success events like delivered/sent, red XCircle for failure events like failed/bounced, gray Clock for pending/processing), timestamp (relative + absolute HH:mm:ss.SSS), event type label (formatted from snake_case), actor, channel, provider badge, and expandable metadata panel (key-value grid). Nodes connected by colored vertical lines matching status. Receipt events distinguished with "Receipt" badge. Status classification via `SUCCESS_EVENTS` and `FAILURE_EVENTS` sets. Empty state with message.
- `components/logs/notification-detail.tsx` — `NotificationDetail` component: full notification detail page with 2-column layout (content + sidebar). Left column: lifecycle timeline card (using `LifecycleTimeline`), delivery receipts table (channel with icon, provider, status badge, provider message ID, received timestamp), rendered content preview (tabs for Subject/HTML/Text/Raw JSON, extracted from render event metadata). Right sidebar: summary card (notification ID, channel with icon, status badge, event count, receipt count), identifiers card (notification/correlation/cycle IDs with copy-to-clipboard buttons), timestamps card (first event, last event, calculated duration). Back navigation to `/logs`. Loading skeleton. Error state with back link. CopyButton helper with clipboard API + checkmark feedback.
- `components/logs/log-list.tsx` — `LogList` component: full log list page with filter card and data table. Filter bar: full-text SearchInput (switches to `/audit/search` endpoint when query >= 2 chars), DateRangePicker, event type text input, status chip filter group (8 statuses: pending, processing, sent, delivered, failed, bounced, suppressed, retrying), channel chip filter group (4 channels: email, sms, whatsapp, push). FilterChipGroup sub-component: clickable rounded chips with active/inactive states, clear button. Data table with 8 columns: expand chevron, notification ID (truncated UUID monospace), event type (Badge), channel (with ChannelIcon), status (StatusBadge), actor, created date, actions (ExternalLink to detail page). Expandable rows: clicking a row fetches trace via `useNotificationTrace` and displays compact `LifecycleTimeline` (first 5 entries) with summary stats inline. Status/channel filters applied client-side on API results. Pagination with page size selector. Refresh button. Clear all filters button. Active filter count display.
- `components/logs/index.ts` — Barrel export for LogList, NotificationDetail, LifecycleTimeline with type exports

**Modified files:**
- `types/notifications.ts` — Added 10 new interfaces for audit-service API response shapes: `TraceSummary` (notificationId, correlationId, cycleId, channel, finalStatus, eventCount, receiptCount), `TraceTimelineEntry` (id, source, eventType, actor, timestamp, metadata, channel, provider, status), `NotificationTraceResponse` (summary + timeline), `CorrelationTraceResponse`, `CycleTraceResponse`, `DeliveryReceipt` (id, notificationId, correlationId, cycleId, channel, provider, status, providerMessageId, rawResponse, receivedAt), `ReceiptsResponse`, `AuditLogsMeta` (page, pageSize, totalCount, totalPages), `AuditLogsResponse` (data + meta)
- `app/logs/page.tsx` — Replaced placeholder with `LogList` component (full log list with filters, search, expandable rows)
- `app/logs/[id]/page.tsx` — Replaced placeholder with `NotificationDetail` component using `useParams` for dynamic notification ID

### Phase 8 — Channels & Providers Module (2026-02-28)

**New files:**
- `hooks/use-channels.ts` — Domain-specific SWR hooks for channels and providers: `useChannels()` (list all channels), `useChannel(id)` (single channel detail), `useUpdateChannel(id)` (PUT channel config), `useProviders()` (list all providers), `useRegisterProvider()` (POST new provider), `useUpdateProvider(id)` (PUT provider config), `useDeleteProvider(id)` (DELETE provider). All delegate to `useApiGet`/`useApiMutation` targeting channel-router-service (:3154) at `/api/v1/channels` and `/api/v1/providers` with appropriate cache invalidation keys.
- `lib/validators/channel-schemas.ts` — Zod validation schemas: `updateChannelSchema` (isActive boolean, routingMode enum [primary/weighted/failover], activeProviderId optional, fallbackChannelId optional nullable), `registerProviderSchema` (providerName, providerId, channel enum, adapterUrl URL, isActive, routingWeight 0-100, rateLimitTokensPerSec, rateLimitMaxBurst), `updateProviderSchema` (all fields optional). Exported form data types: `UpdateChannelFormData`, `RegisterProviderFormData`, `UpdateProviderFormData`.
- `components/channels/health-indicator.tsx` — `HealthIndicator` component: small colored dot with label indicating health status (green=healthy, yellow=degraded, red=unhealthy, gray=unknown/not configured). Radix Tooltip on hover with status details. `deriveHealthStatus()` utility function that computes health from channel active state and provider count. Exported types: `HealthStatus`, `HealthIndicatorProps`.
- `components/channels/channel-list.tsx` — `ChannelList` component: 2-column card grid layout (responsive, 1 column on mobile). Each card shows: channel type icon (via ChannelIcon), channel name label, active/inactive Badge, health indicator dot, active/total provider count, routing mode. Click card navigates to `/channels/:id` detail page. Loading state via CardGridSkeleton. Error and empty states with appropriate messaging. Uses `useChannels()` and `useProviders()` hooks.
- `components/channels/channel-detail.tsx` — `ChannelDetail` component: full channel management page with 3 sub-components. `ChannelConfigForm`: React Hook Form + Zod validation card with active/inactive Switch toggle, routing mode Select (primary/weighted/failover), fallback channel ID input; saves via `useUpdateChannel`. `ProviderTable`: HTML table listing all providers for this channel with columns (name, provider ID, adapter URL, routing weight, status badge, deregister button). `ProviderHealthCard`: sidebar card showing channel health overview, active provider count, routing mode, per-provider health indicators. Register provider button opens `ProviderForm` dialog. Deregister button opens `ConfirmDialog` with async delete via `useDeleteProvider`. Back navigation to `/channels`. Toast notifications on success/error.
- `components/channels/provider-form.tsx` — `ProviderForm` component: Dialog-based registration form with React Hook Form + Zod validation. Fields: provider name, provider ID, adapter URL, routing weight (0-100), rate limit tokens/sec, max burst, active toggle Switch. Form resets on dialog open. Cancel and submit buttons with loading spinner. Channel type is pre-set from parent channel context.
- `components/channels/index.ts` — Barrel export for ChannelList, ChannelDetail, ProviderForm, HealthIndicator with type exports

**Modified files:**
- `app/channels/page.tsx` — Replaced placeholder with `ChannelList` component (channel card grid with health indicators)
- `app/channels/[id]/page.tsx` — Replaced placeholder with `ChannelDetail` component using `useParams` for dynamic channel ID

### Phase 7 — Templates Module — CRUD + Preview + Versioning (2026-02-28)

**New dependencies:**
- @tiptap/react, @tiptap/starter-kit, @tiptap/extension-link, @tiptap/extension-image, @tiptap/extension-text-align, @tiptap/extension-placeholder, @tiptap/extension-color, @tiptap/extension-text-style, @tiptap/pm (WYSIWYG HTML email editing)

**New files:**
- `hooks/use-templates.ts` — Domain-specific SWR hooks for templates: `useTemplates(params?)` (paginated list with channel, isActive, search filters), `useTemplate(id)` (single detail with versions), `useCreateTemplate()`, `useUpdateTemplate(id)`, `useDeleteTemplate(id)`, `useRenderTemplate(id)`, `usePreviewTemplate(id)`, `useRollbackTemplate(id)`. All delegate to `useApiGet`/`useApiMutation` targeting template-service (:3153) at `/api/v1/templates` with appropriate cache invalidation keys.
- `lib/validators/template-schemas.ts` — Zod validation schemas: `createTemplateSchema` (name, slug with lowercase-hyphen regex, description, channels array), `updateTemplateSchema` (name, description, channels, changeSummary). `channelVariantSchema` sub-schema (channel enum, optional subject, body, metadata). 4 channel options (email, sms, whatsapp, push) with labels. Utility functions: `generateSlug()` (name → URL-safe slug), `extractVariables()` (detects `{{variable}}` patterns in template body text). Character limit constants: `SMS_MAX_CHARS` (160), `SMS_CONCAT_CHARS` (153), `PUSH_MAX_CHARS` (256).
- `components/templates/tiptap-editor.tsx` — `TipTapEditor` component: WYSIWYG HTML email editor using TipTap/ProseMirror. Toolbar with: headings (H1-H3), bold, italic, strikethrough, inline code, link (URL prompt), image (URL prompt), text color, text alignment (left/center/right), bullet list, ordered list, blockquote, horizontal rule, undo/redo. Source code toggle (HTML view via textarea). Syncs bidirectionally between rich editor and raw HTML. Uses StarterKit, Link, Image, TextAlign, Placeholder, TextStyle, Color extensions.
- `components/templates/template-list.tsx` — `TemplateList` component: card grid layout (3 columns on desktop, 2 on tablet, 1 on mobile) with grid/list view toggle. Each card shows: name, slug (monospace), status badge, description (2-line clamp), channel badges with icons, version number, relative update time, action buttons (Preview, Versions, Delete). List view as compact rows with edit/versions/delete icon buttons. Filters: search input, channel select (email/sms/whatsapp/push), status select (active/inactive). Empty state with create button. Pagination info with "Load More" button.
- `components/templates/template-form.tsx` — `TemplateForm` component: React Hook Form + Zod validation with 2 Card sections (General, Channel Variants) in a 2:1 grid layout with sidebar. General section: name (auto-generates slug), slug (create mode only, editable, monospace, lowercase-hyphen validated), description, changeSummary (edit mode only). Channel Variants section: tabbed interface per channel (email, sms, whatsapp, push). Add channel buttons for available channels. Email tab: subject input + TipTap WYSIWYG body editor. SMS/WhatsApp/Push tabs: plain textarea with character counter (160/256 char limits). Remove channel button per tab. Sidebar: Variable toolbar (detects `{{variable}}` patterns, click-to-insert), Preview panel (edit mode only, renders via `TemplatePreview`).
- `components/templates/template-preview.tsx` — `TemplatePreview` component: Card with variable input form (auto-detected + declared variables with required indicators), "Preview Template" button calling POST `/api/v1/templates/:id/preview`. Displays rendered output in channel tabs: email rendered as HTML (dangerouslySetInnerHTML for server-sanitized content), SMS/WhatsApp/Push as pre-formatted text. Warnings for missing required variables.
- `components/templates/version-history.tsx` — `VersionHistory` component: sorted list of template versions (newest first) as cards. Each card shows: version number, "Current" badge for active version, created date, created by, channel badges. "Rollback" button per non-current version with ConfirmDialog confirmation. Calls POST `/api/v1/templates/:id/rollback` with version number.
- `components/templates/index.ts` — Barrel export for TemplateList, TemplateForm, TemplatePreview, VersionHistory, TipTapEditor

**Modified files:**
- `app/templates/page.tsx` — Replaced placeholder with `TemplateList` component (card grid with filters and view toggle)
- `app/templates/new/page.tsx` — Replaced placeholder with `TemplateForm` in create mode, `useCreateTemplate` hook, toast notifications on success/error, redirect to detail page on create
- `app/templates/[id]/page.tsx` — Replaced placeholder with `TemplateForm` in edit mode, `useTemplate(id)` for data loading, `useUpdateTemplate(id)` hook, loading spinner and error/not-found empty states
- `app/templates/[id]/versions/page.tsx` — Replaced placeholder with `VersionHistory` component, `useTemplate(id)` and `useRollbackTemplate(id)` hooks

### Phase 6 — Notification Rules Module — Full CRUD (2026-02-28)

**New files:**
- `hooks/use-rules.ts` — Domain-specific SWR hooks for notification rules: `useRules(params?)` (paginated list with event type and active status filters), `useRule(id)` (single detail), `useCreateRule()`, `useUpdateRule(id)`, `useDeleteRule(id)`. All delegate to `useApiGet`/`useApiMutation` targeting notification-engine-service (:3152) at `/api/v1/rules` with appropriate cache invalidation keys.
- `lib/validators/rule-schemas.ts` — Zod validation schemas: `createRuleSchema` with nested `conditionRowSchema` (field, operator, value), `ruleActionSchema` (templateId, channels array, recipientType, recipientGroupId, delayMinutes), and `suppressionSchema` (windowMinutes, maxCount, key). 11 condition operators (equals, notEquals, contains, gt, lt, gte, lte, in, notIn, exists, regex). 4 channel options (email, sms, whatsapp, push). 3 recipient types (customer, group, custom). API converters: `conditionsToApi()` converts flat condition rows to MongoDB-style operator format (`$eq`, `$gt`, etc.); `conditionsFromApi()` reverses the conversion; `suppressionToApi()` and `suppressionFromApi()` handle suppression config serialization.
- `components/rules/rule-list.tsx` — `RuleList` component: DataTable with 7 columns (name, event type, channels with ChannelIcon, priority, exclusive flag, status, created date); 4 filter controls (search input, event type select, status select, channel select); 3 row actions (Edit, Duplicate with auto-create copy, Delete with ConfirmDialog); pagination with page size selector; empty state with create button; error state with retry. Duplicate creates a copy via `useCreateRule` with "(Copy)" suffix and redirects to edit.
- `components/rules/rule-form.tsx` — `RuleForm` component: React Hook Form + Zod validation with 4 Card sections (General, Conditions, Actions, Suppression). General section: name, eventType (disabled when editing), priority (number), description, deliveryPriority select (Inherit/Normal/Critical), isExclusive switch. Conditions section: dynamic `useFieldArray` with add/remove rows, each row has field (text), operator (11-option select), value (text); no conditions = match all events. Actions section: dynamic `useFieldArray` of action cards, each with templateId, recipientType select, channel checkboxes (email/sms/whatsapp/push), recipientGroupId, delayMinutes; minimum 1 action. Suppression section: enable/disable switch revealing windowMinutes, maxCount, key inputs. Responsive grid layouts. Reusable for create and edit modes via `isEditing` prop.
- `components/rules/index.ts` — Barrel export for RuleList, RuleForm

**Modified files:**
- `app/rules/page.tsx` — Replaced placeholder with `RuleList` component (full CRUD list view)
- `app/rules/new/page.tsx` — Replaced placeholder with `RuleForm` in create mode, `useCreateRule` hook, `conditionsToApi`/`suppressionToApi` conversions, toast notifications on success/error, redirect to detail page on create
- `app/rules/[id]/page.tsx` — Replaced placeholder with `RuleForm` in edit mode, `useRule(id)` for data loading, `useUpdateRule(id)` hook, loading spinner and error/not-found empty states, `conditionsToApi`/`suppressionToApi` conversions on submit

### Phase 5 — Event Mappings Module — Full CRUD (2026-02-28)

**New files:**
- `hooks/use-mappings.ts` — Domain-specific SWR hooks for event mappings: `useMappings(params?)` (paginated list with filters), `useMapping(id)` (single detail), `useCreateMapping()`, `useUpdateMapping(id)`, `useDeleteMapping(id)`, `useTestMapping(id)`. All delegate to `useApiGet`/`useApiMutation` with appropriate cache invalidation keys.
- `lib/validators/mapping-schemas.ts` — Zod validation schemas: `createMappingSchema` and `updateMappingSchema` with field mapping entry sub-schema (sourceField, targetField, transform, required, defaultValue). `TRANSFORM_OPTIONS` constant with 11 transform types (none, toString, toNumber, toBoolean, toDate, uppercase, lowercase, trim, split, join, template). `fieldMappingsToApi()` converts flat form array to backend Record shape. `fieldMappingsFromApi()` converts backend Record back to form array.
- `components/mappings/mapping-list.tsx` — `MappingList` component: DataTable with 7 columns (name, source system, event type, priority, status, field count, created date); 4 filter controls (search input, source system select, status select, priority select); 3 row actions (Edit, Test, Delete with ConfirmDialog); pagination with page size selector; server-side sorting; empty state with create button; error state with retry.
- `components/mappings/mapping-form.tsx` — `MappingForm` component: React Hook Form + Zod validation with 3 Card sections (General, Advanced Options, Field Mappings). General section: name, sourceId, eventType, description, priority select, active switch. Advanced section: timestampField, timestampFormat, sourceEventIdField. Field Mappings section: dynamic `useFieldArray` with add/remove rows, each row has sourceField, targetField, transform select (11 options), required switch, defaultValue input. Responsive grid layout with mobile-friendly card view per row. Reusable for both create and edit modes via `isEditing` prop.
- `components/mappings/mapping-test-panel.tsx` — `MappingTestPanel` component: side-by-side JSON input (textarea) and normalized output display (read-only textarea). "Run Test" button calls POST `/api/v1/event-mappings/:id/test`. Displays success/failure badge, error count, and error detail list. Pre-populated with sample payload JSON.
- `components/mappings/index.ts` — Barrel export for MappingList, MappingForm, MappingTestPanel

**Modified files:**
- `app/event-mappings/page.tsx` — Replaced placeholder with `MappingList` component (full CRUD list view)
- `app/event-mappings/new/page.tsx` — Replaced placeholder with `MappingForm` in create mode, `useCreateMapping` hook, `fieldMappingsToApi` conversion, toast notifications on success/error, redirect to detail page on create
- `app/event-mappings/[id]/page.tsx` — Replaced placeholder with tabbed view (Radix Tabs): Edit tab renders `MappingForm` with `initialData` from `useMapping(id)`, Test tab renders `MappingTestPanel`. Supports `?tab=test` URL param for direct navigation to test tab. Loading spinner and error/not-found empty states.

### Phase 4 — DataTable, Shared Feature Components & SWR Hook Pattern (2026-02-28)

**New files:**
- `components/shared/data-table.tsx` — Generic, reusable DataTable component: server-side pagination (page, pageSize, total) with page size selector; server-side sorting (sortBy, sortOrder) via clickable column headers; loading state (skeleton rows); empty state (configurable message + icon + action); error state with retry button; optional row click handler; optional row actions column (dropdown menu with edit/delete/etc.); responsive horizontal scroll; composes ui/table, ui/skeleton, ui/button, ui/dropdown-menu primitives
- `components/shared/pagination.tsx` — Page numbers with ellipsis for large ranges, previous/next buttons, "Showing X to Y of Z" text, page size selector (10, 25, 50, 100)
- `components/shared/search-input.tsx` — Debounced search input (configurable delay, default 300ms) with search icon, clear button, controlled/uncontrolled value support
- `components/shared/status-badge.tsx` — Color-coded status display using ui/badge: active/success/delivered → success (green), pending/processing → warning (yellow), failed/error → destructive (red), inactive/draft → secondary (gray), partial → outline (orange)
- `components/shared/confirm-dialog.tsx` — Destructive action confirmation dialog: title, description, confirm button (destructive variant), cancel button, loading state on confirm for async operations
- `components/shared/empty-state.tsx` — Centered icon + title + description + optional action button, used when lists/tables have no data
- `components/shared/loading-skeleton.tsx` — Three skeleton variants: PageSkeleton (page-level for Suspense), TableSkeleton (configurable rows/columns), CardGridSkeleton (configurable count)
- `components/shared/channel-icon.tsx` — Returns Lucide icon per channel type (Mail for email, MessageSquare for SMS, MessageCircle for WhatsApp, Bell for push, Send for unknown)
- `components/shared/date-range-picker.tsx` — Two date inputs (from/to) using Radix Popover + native date inputs, quick presets (Last 24h, Last 7 days, Last 30 days, Custom), uses date-fns for formatting
- `components/shared/page-header.tsx` — Consistent page header with title, optional description, and action buttons area, responsive flex layout
- `components/shared/index.ts` — Barrel export for all 10 shared components with type exports
- `hooks/use-api.ts` — SWR hook pattern: `useApiGet(service, path, params?)` wraps SWR with API client fetcher (loading, error, data states, configurable revalidation, enabled flag); `useApiMutation(service, path, method?, invalidateKeys?)` wraps fetch for POST/PUT/PATCH/DELETE with SWR cache invalidation, isMutating/error states

**Modified files:**
- `app/test-components/page.tsx` — Added 10 new sections (21–30) demonstrating all Phase 4 shared components: PageHeader, StatusBadge (all 14 status variants), ChannelIcon (5 channels), SearchInput (debounced with live value display), DateRangePicker, Pagination (standalone), ConfirmDialog (with simulated async delete), EmptyState (2 variants), Loading Skeletons (3 variants in tabs), DataTable (full-featured with 25 mock rows, 6 columns, sorting, pagination, row actions, toggle loading/empty states)

### Phase 3 — Layout Shell, Sidebar & Navigation (2026-02-28)

**New files:**
- `components/layout/sidebar-provider.tsx` — React context for sidebar state (expanded/collapsed), mobile detection via `matchMedia`, localStorage persistence, toggle function
- `components/layout/sidebar.tsx` — Fixed left sidebar (w-64 expanded, w-16 collapsed) with app logo, 10 navigation items with Lucide icons, active route highlighting via `usePathname()`, collapse toggle button, tooltips in collapsed mode. `MobileSidebarContent` export for Sheet overlay.
- `components/layout/header.tsx` — Sticky top header bar with responsive margin, mobile hamburger button, Sheet overlay for mobile sidebar, breadcrumb integration
- `components/layout/breadcrumbs.tsx` — Auto-generated breadcrumbs from current route path, clickable parent segments, Home icon root, segment label mapping, UUID abbreviation
- `app/providers.tsx` — Client component wrapping SWRConfig (global error toast, revalidateOnFocus: false) and SidebarProvider
- `app/layout-shell.tsx` — Client component rendering Sidebar + Header + main content area with responsive margin transitions
- `app/not-found.tsx` — Custom 404 page with "Go to Dashboard" link
- `app/dashboard/page.tsx` — Dashboard placeholder page
- `app/rules/page.tsx` — Rules list placeholder
- `app/rules/new/page.tsx` — Create rule placeholder
- `app/rules/[id]/page.tsx` — Rule detail placeholder
- `app/templates/page.tsx` — Templates list placeholder
- `app/templates/new/page.tsx` — Create template placeholder
- `app/templates/[id]/page.tsx` — Template editor placeholder
- `app/templates/[id]/versions/page.tsx` — Template version history placeholder
- `app/channels/page.tsx` — Channels list placeholder
- `app/channels/[id]/page.tsx` — Channel configuration placeholder
- `app/logs/page.tsx` — Notification logs placeholder
- `app/logs/[id]/page.tsx` — Notification detail placeholder
- `app/event-mappings/page.tsx` — Event mappings list placeholder
- `app/event-mappings/new/page.tsx` — Create mapping placeholder
- `app/event-mappings/[id]/page.tsx` — Mapping editor placeholder
- `app/bulk-upload/page.tsx` — Bulk upload placeholder
- `app/bulk-upload/[id]/page.tsx` — Upload detail placeholder
- `app/recipient-groups/page.tsx` — Recipient groups list placeholder
- `app/recipient-groups/new/page.tsx` — Create recipient group placeholder
- `app/recipient-groups/[id]/page.tsx` — Recipient group detail placeholder
- `app/audit/page.tsx` — Audit trail placeholder
- `app/settings/page.tsx` — Settings placeholder

**Modified files:**
- `app/layout.tsx` — Updated metadata (title: "Notification Admin UI"), added Providers wrapper (SWRConfig + SidebarProvider), LayoutShell (Sidebar + Header + main), Sonner Toaster component

**Responsive behavior:**
- Desktop (>=1280px): Full sidebar (w-64) + content with left margin
- Tablet (768–1279px): Auto-collapsed sidebar (icon-only w-16) with tooltips
- Mobile (<768px): Sidebar hidden, accessible via hamburger → Sheet overlay (left side)

### Phase 2 — UI Primitive Component Library (2026-02-28)

**New dependency:**
- @radix-ui/react-scroll-area

**New files:**
- `components/ui/button.tsx` — Button with CVA variants (default, destructive, outline, secondary, ghost, link) and sizes (default, sm, lg, icon). Radix Slot for `asChild` support.
- `components/ui/input.tsx` — Styled text input with error state support
- `components/ui/textarea.tsx` — Styled textarea with error state support
- `components/ui/label.tsx` — Radix Label with required indicator (`*`) support
- `components/ui/select.tsx` — Radix Select with trigger, content, item, separator, scroll buttons
- `components/ui/checkbox.tsx` — Radix Checkbox with check icon indicator
- `components/ui/switch.tsx` — Radix Switch for boolean toggles
- `components/ui/dialog.tsx` — Radix Dialog with overlay, content, header, footer, title, description, close button
- `components/ui/dropdown-menu.tsx` — Radix DropdownMenu with trigger, content, item, checkbox item, radio item, sub-menu, separator, label, shortcut
- `components/ui/tabs.tsx` — Radix Tabs with list, trigger, content
- `components/ui/popover.tsx` — Radix Popover with trigger, content
- `components/ui/tooltip.tsx` — Radix Tooltip with provider, trigger, content
- `components/ui/card.tsx` — Card container with header, title, description, content, footer
- `components/ui/badge.tsx` — Badge with CVA variants (default, secondary, destructive, outline, success, warning)
- `components/ui/separator.tsx` — Radix Separator (horizontal/vertical)
- `components/ui/skeleton.tsx` — Animated loading placeholder (pulse animation)
- `components/ui/table.tsx` — Semantic HTML table with styled header, body, footer, row, head, cell, caption
- `components/ui/scroll-area.tsx` — Radix ScrollArea with vertical/horizontal scrollbar
- `components/ui/sheet.tsx` — Radix Dialog-based slide-out panel (top, bottom, left, right sides) for mobile sidebar
- `components/ui/form.tsx` — React Hook Form + Radix Label integration (FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage) using React context
- `components/ui/index.ts` — Barrel export for all 20 UI components
- `app/test-components/page.tsx` — Temporary test page rendering every UI component with sample props for visual verification

**Modified files:**
- `app/globals.css` — Comprehensive CSS custom property design token system: background, foreground, card, popover, primary, secondary, muted, accent, destructive, success, warning colors (with foreground variants); border, input, ring colors; sidebar colors; chart colors (chart-1 through chart-5); border radius tokens; dark mode overrides via `@media (prefers-color-scheme: dark)`. All tokens mapped to Tailwind v4 via `@theme inline`.

### Phase 1 — Foundation: Dependencies, API Client, Types & Environment (2026-02-28)

**Dependencies installed:**
- swr, react-hook-form, @hookform/resolvers, zod
- @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-select, @radix-ui/react-tabs, @radix-ui/react-switch, @radix-ui/react-label, @radix-ui/react-separator, @radix-ui/react-tooltip, @radix-ui/react-popover, @radix-ui/react-checkbox, @radix-ui/react-slot
- lucide-react, sonner, date-fns, clsx, tailwind-merge, class-variance-authority

**New files:**
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `lib/service-config.ts` — Service URL registry for 7 backend microservices (reads `NEXT_PUBLIC_*_URL` env vars)
- `lib/api-client.ts` — Multi-service fetch wrapper with `ApiError` class, typed HTTP methods (get/post/put/patch/delete), query string serialization, SWR-compatible `swrFetcher`
- `lib/formatters.ts` — Utility functions: `formatDate`, `formatRelativeTime`, `formatNumber`, `formatPercentage`, `formatStatus`, `truncate`
- `types/api.ts` — `PaginatedResponse<T>`, `ApiErrorResponse`, `SortOrder`, common query param interfaces
- `types/mappings.ts` — `EventMapping`, `CreateMappingDto`, `UpdateMappingDto`, `TestMappingResult` (aligned with event-ingestion-service DTOs)
- `types/rules.ts` — `Rule`, `RuleAction`, `CreateRuleDto`, `UpdateRuleDto`, `ChannelType`, `RecipientType`, `DeliveryPriority` (aligned with notification-engine-service DTOs)
- `types/templates.ts` — `Template`, `TemplateVersion`, `TemplateVariable`, `TemplateChannel`, `CreateTemplateDto`, `RenderResult`, `PreviewResult` (aligned with template-service DTOs)
- `types/channels.ts` — `Channel`, `ChannelConfig`, `Provider`, `RegisterProviderDto`, `UpdateProviderDto`, `UpdateChannelDto` (aligned with channel-router-service DTOs)
- `types/notifications.ts` — `Notification`, `StatusTransition`, `DeliveryAttempt`, `NotificationTimeline`, `TimelineEvent`
- `types/uploads.ts` — `Upload`, `UploadRow`, `UploadStatus` (aligned with bulk-upload-service DTOs)
- `types/recipients.ts` — `RecipientGroup`, `RecipientGroupMember`, `CreateRecipientGroupDto`, `CreateRecipientGroupMemberDto` (aligned with notification-engine-service DTOs)
- `types/audit.ts` — `AuditEvent`, `AuditSearchParams`, `DlqEntry` (aligned with audit-service DTOs)
- `types/dashboard.ts` — `AnalyticsSummary`, `VolumeData`, `DeliveryRateData`, `ChannelBreakdown`, `RuleStats`, `ChannelHealth`, `DeliveryMetrics`, `AnalyticsQueryParams`
- `types/settings.ts` — `SystemConfig`, `UpdateSystemConfigDto`
- `types/index.ts` — Barrel export for all type modules
- `.env.local` — Development defaults for all 7 service URLs + app config (polling intervals, upload limits, debounce values, page size)

**Modified files:**
- `app/page.tsx` — Replaced default boilerplate with `redirect('/dashboard')` using `next/navigation`
