# Notification Admin UI

Next.js admin frontend for the Notification API platform. Connects directly to 7 backend microservices (no BFF/gateway dependency). All pages are currently public (authentication deferred).

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3159 |
| **Technology** | Next.js 16 (TypeScript, App Router) |
| **Runtime** | Node.js |
| **Database** | None (frontend-only, all data via API) |
| **Authentication** | None (deferred — all pages public) |

## Implementation Status

**Phase 13 complete** — Audit Trail, DLQ Viewer & Polish. Tabbed audit page: Audit Logs tab with full-text search, event type/actor/date range filters, expandable rows showing metadata and payload JSON with copy-to-clipboard IDs, CSV export fetching all pages. Dead Letter Queue tab with status filter, status count badges, DataTable with row actions (Investigate, Reprocess, Discard) following strict state machine transitions (pending→investigated/discarded, investigated→reprocessed/discarded). Polish: React error boundary component, Next.js error.tsx for all 10 route groups + global, loading.tsx with PageSkeleton for all routes, per-page metadata titles via title template, removed test-components page, DLQ status variants in StatusBadge. SWR hooks in `hooks/use-audit.ts` (`useAuditLogs`, `useAuditSearch`, `useDlqEntries`, `useUpdateDlqStatus`, `useReprocessDlq`, `useCsvExport`). Components in `components/audit/` (AuditLogViewer, AuditDetailRow, CsvExportButton, DlqViewer).

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Foundation: Dependencies, API Client, Types & Environment | **Done** |
| Phase 2 | UI Primitive Component Library | **Done** |
| Phase 3 | Layout Shell, Sidebar & Navigation, Placeholder Pages | **Done** |
| Phase 4 | DataTable, Shared Feature Components & SWR Hook Pattern | **Done** |
| Phase 5 | Event Mappings Module (Full CRUD) | **Done** |
| Phase 6 | Notification Rules Module (Full CRUD) | **Done** |
| Phase 7 | Templates Module (CRUD + Preview + Versioning) | **Done** |
| Phase 8 | Channels & Providers Module | **Done** |
| Phase 9 | Notification Logs, Search & Trace Module | **Done** |
| Phase 10 | Bulk Upload Module | **Done** |
| Phase 11 | Recipient Groups & Settings Modules | **Done** |
| Phase 12 | Dashboard & Analytics Module | **Done** |
| Phase 13 | Audit Trail, DLQ Viewer & Polish | **Done** |

## Backend Integration

Direct microservice communication (no BFF/gateway proxy). Each UI feature talks to its backend service directly.

| UI Feature | Service | Port | API Base |
|---|---|---|---|
| Event Mappings | event-ingestion-service | 3151 | `/api/v1/event-mappings` |
| Rules | notification-engine-service | 3152 | `/api/v1/rules` |
| Recipient Groups | notification-engine-service | 3152 | `/api/v1/recipient-groups` |
| Templates | template-service | 3153 | `/api/v1/templates` |
| Channels | channel-router-service | 3154 | `/api/v1/channels` |
| Providers | channel-router-service | 3154 | `/api/v1/providers` |
| System Config | admin-service | 3155 | `/api/v1/system-configs` |
| Dashboard & Analytics | audit-service | 3156 | `/api/v1/analytics/summary` |
| Notification Logs | audit-service | 3156 | `/api/v1/logs` |
| Notification Trace | audit-service | 3156 | `/api/v1/trace` |
| Audit Logs & Search | audit-service | 3156 | `/api/v1/logs`, `/api/v1/search` |
| Dead Letter Queue | audit-service | 3156 | `/api/v1/dlq` |
| Bulk Upload | bulk-upload-service | 3158 | `/api/v1/uploads` |

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.1.6 | Next.js framework (App Router, SSR, server components) |
| `react` | 19.2.3 | UI library |
| `react-dom` | 19.2.3 | React DOM renderer |
| `tailwindcss` | ^4 | Utility-first CSS framework (v4, PostCSS integration) |
| `@tailwindcss/postcss` | ^4 | Tailwind CSS PostCSS plugin |
| `typescript` | ^5 | TypeScript compiler |
| `eslint` | ^9 | Linting (flat config) |
| `eslint-config-next` | 16.1.6 | Next.js ESLint rules |
| `swr` | ^2 | Data fetching with caching and revalidation |
| `@radix-ui/react-*` | Latest | Accessible unstyled UI primitives (dialog, dropdown, select, tabs, switch, label, separator, tooltip, popover, checkbox, slot, scroll-area) |
| `react-hook-form` | ^7 | Performant form handling |
| `@hookform/resolvers` | ^3 | Zod integration for react-hook-form |
| `zod` | ^3 | Runtime schema validation |
| `lucide-react` | Latest | Icon set |
| `sonner` | Latest | Toast notification system |
| `date-fns` | ^4 | Date formatting and manipulation |
| `clsx` | ^2 | Conditional class name utility |
| `tailwind-merge` | ^3 | Tailwind class deduplication |
| `class-variance-authority` | ^0.7 | Component variant management |
| `@tiptap/react` | Latest | TipTap WYSIWYG editor React bindings |
| `@tiptap/starter-kit` | Latest | TipTap starter extensions (bold, italic, headings, lists, etc.) |
| `@tiptap/extension-*` | Latest | TipTap extensions: link, image, text-align, placeholder, color, text-style |
| `recharts` | ^2 | Charting library for dashboard analytics (area, bar, pie charts) |

## NPM Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `next dev` | Run dev server with hot reload |
| `build` | `next build` | Production build |
| `start` | `next start` | Run production server |
| `lint` | `eslint` | Lint source files |

## Planned Routes

| Route | Purpose | Status |
|---|---|---|
| `/dashboard` | Analytics dashboard (audit-service) | Done |
| `/rules` | Notification rules list | Done |
| `/rules/new` | Create new rule | Done |
| `/rules/:id` | Edit rule | Done |
| `/templates` | Template list (card grid with filters) | Done |
| `/templates/new` | Create new template (WYSIWYG editor) | Done |
| `/templates/:id` | Edit template with preview | Done |
| `/templates/:id/versions` | Version history with rollback | Done |
| `/channels` | Channel configuration | Done |
| `/channels/:id` | Channel detail & providers | Done |
| `/logs` | Notification logs search | Done |
| `/logs/:id` | Log detail & lifecycle trace | Done |
| `/event-mappings` | Event mapping list | Done |
| `/event-mappings/new` | Create new mapping | Done |
| `/event-mappings/:id` | Edit mapping & test | Done |
| `/bulk-upload` | Bulk upload (XLSX) | Done |
| `/bulk-upload/:id` | Upload detail & results | Done |
| `/recipient-groups` | Recipient group list | Done |
| `/recipient-groups/new` | Create new group | Done |
| `/recipient-groups/:id` | Edit group & members | Done |
| `/audit` | Audit trail (logs + DLQ, tabbed) | Done |
| `/settings` | System configuration | Done |

## Folder Structure

```
notification-admin-ui/
├── app/                            # Next.js App Router
│   ├── layout.tsx                  # Root layout with sidebar & navigation
│   ├── page.tsx                    # Redirect to /dashboard
│   ├── globals.css                 # Tailwind CSS imports & global styles
│   ├── dashboard/
│   ├── rules/
│   ├── templates/
│   ├── channels/
│   ├── logs/
│   ├── event-mappings/
│   ├── bulk-upload/
│   ├── recipient-groups/
│   ├── audit/
│   └── settings/
├── components/
│   ├── ui/                         # Primitive/shared UI components
│   ├── layout/                     # Sidebar, Header, Breadcrumbs
│   ├── dashboard/                  # Dashboard-specific components
│   ├── rules/                      # Rules-specific components
│   ├── templates/                  # Template-specific components
│   ├── channels/                   # Channel-specific components
│   ├── logs/                       # Logs-specific components
│   ├── mappings/                   # Mapping-specific components
│   ├── bulk-upload/                # Bulk upload components
│   ├── recipient-groups/           # Recipient group components
│   ├── settings/                   # Settings components
│   ├── audit/                      # Audit trail & DLQ components
│   └── shared/                     # Cross-feature shared components (+ ErrorBoundary)
├── hooks/
│   ├── use-api.ts                  # SWR hooks (useApiGet, useApiMutation)
│   ├── use-mappings.ts             # Event mapping hooks (useMappings, useMapping, useCreateMapping, etc.)
│   ├── use-rules.ts                # Rule hooks (useRules, useRule, useCreateRule, useUpdateRule, useDeleteRule)
│   ├── use-templates.ts            # Template hooks (useTemplates, useTemplate, useCreateTemplate, useUpdateTemplate, useDeleteTemplate, useRenderTemplate, usePreviewTemplate, useRollbackTemplate)
│   ├── use-channels.ts             # Channel/provider hooks (useChannels, useChannel, useUpdateChannel, useProviders, useRegisterProvider, useUpdateProvider, useDeleteProvider)
│   ├── use-notifications.ts       # Notification log/trace hooks (useNotificationLogs, useNotificationSearch, useNotificationTrace, useCorrelationTrace, useCycleTrace, useDeliveryReceipts)
│   ├── use-bulk-upload.ts         # Bulk upload hooks (useUploads, useUpload, useUploadStatus, useCreateUpload, useRetryUpload, useDeleteUpload, useDownloadResult, useUploadErrors)
│   ├── use-recipient-groups.ts    # Recipient group hooks (useRecipientGroups, useRecipientGroup, useCreateRecipientGroup, useUpdateRecipientGroup, useDeleteRecipientGroup, useRecipientGroupMembers, useAddRecipientGroupMember, useRemoveRecipientGroupMember)
│   ├── use-dashboard.ts           # Dashboard hooks (useDashboardSummary, useAnalytics)
│   ├── use-audit.ts               # Audit hooks (useAuditLogs, useAuditSearch, useDlqEntries, useUpdateDlqStatus, useReprocessDlq, useCsvExport)
│   └── use-settings.ts            # Settings hooks (useSystemConfigs, useUpdateSystemConfig)
├── lib/
│   ├── api-client.ts               # Multi-service fetch wrapper (ApiError, swrFetcher)
│   ├── service-config.ts           # Service URL registry (7 services)
│   ├── utils.ts                    # cn() helper (clsx + tailwind-merge)
│   ├── formatters.ts               # Date, number, status formatting utilities
│   └── validators/
│       ├── mapping-schemas.ts      # Zod schemas for event mapping forms + API converters
│       ├── rule-schemas.ts         # Zod schemas for rule forms + condition/suppression API converters
│       ├── template-schemas.ts     # Zod schemas for template forms + slug/variable utilities
│       ├── channel-schemas.ts      # Zod schemas for channel config + provider registration forms
│       └── recipient-group-schemas.ts  # Zod schemas for recipient group forms + add member form
├── types/                          # TypeScript type definitions (12 files, barrel export)
└── public/                         # Static assets
```

## UI Component Library (`components/ui/`)

20 primitive components following the shadcn/ui pattern: unstyled Radix UI primitives wrapped with Tailwind CSS classes, using CVA for variant management. All exported via barrel `components/ui/index.ts`.

| Component | File | Radix Primitive | Variants |
|---|---|---|---|
| Button | `button.tsx` | Slot (asChild) | default, destructive, outline, secondary, ghost, link / sm, default, lg, icon |
| Input | `input.tsx` | — | error state |
| Textarea | `textarea.tsx` | — | error state |
| Label | `label.tsx` | Label | required indicator |
| Select | `select.tsx` | Select | trigger, content, item, separator |
| Checkbox | `checkbox.tsx` | Checkbox | — |
| Switch | `switch.tsx` | Switch | — |
| Dialog | `dialog.tsx` | Dialog | overlay, content, header, footer, title, description |
| DropdownMenu | `dropdown-menu.tsx` | DropdownMenu | trigger, content, item, checkbox item, radio item, separator |
| Tabs | `tabs.tsx` | Tabs | list, trigger, content |
| Popover | `popover.tsx` | Popover | trigger, content |
| Tooltip | `tooltip.tsx` | Tooltip | provider, trigger, content |
| Card | `card.tsx` | — | header, title, description, content, footer |
| Badge | `badge.tsx` | — | default, secondary, destructive, outline, success, warning |
| Separator | `separator.tsx` | Separator | horizontal, vertical |
| Skeleton | `skeleton.tsx` | — | animated pulse |
| Table | `table.tsx` | — | header, body, footer, row, head, cell, caption |
| ScrollArea | `scroll-area.tsx` | ScrollArea | vertical, horizontal scrollbar |
| Sheet | `sheet.tsx` | Dialog | top, bottom, left, right sides |
| Form | `form.tsx` | Label + Slot | FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage |

## Shared Feature Components (`components/shared/`)

10 shared components for data display, user interaction, and page structure. All exported via barrel `components/shared/index.ts`.

| Component | File | Purpose |
|---|---|---|
| DataTable | `data-table.tsx` | Generic table with server-side pagination/sorting, loading/empty/error states, row click, row actions dropdown |
| Pagination | `pagination.tsx` | Page numbers with ellipsis, prev/next, "Showing X to Y of Z", page size selector |
| SearchInput | `search-input.tsx` | Debounced search input with search icon and clear button (configurable delay) |
| StatusBadge | `status-badge.tsx` | Color-coded status display mapping statuses to Badge variants (green/yellow/red/gray/orange) |
| ConfirmDialog | `confirm-dialog.tsx` | Destructive action confirmation dialog with async loading state |
| EmptyState | `empty-state.tsx` | Centered icon + title + description + optional action button for empty lists/tables |
| PageSkeleton / TableSkeleton / CardGridSkeleton | `loading-skeleton.tsx` | Page-level, table, and card grid loading skeletons |
| ChannelIcon | `channel-icon.tsx` | Lucide icon per channel type (email→Mail, sms→MessageSquare, whatsapp→MessageCircle, push→Bell) |
| DateRangePicker | `date-range-picker.tsx` | From/to date inputs with Radix Popover, quick presets (24h, 7d, 30d, custom) |
| PageHeader | `page-header.tsx` | Consistent page header with title, optional description, and action buttons area |

## SWR Hooks (`hooks/use-api.ts`)

| Hook | Signature | Purpose |
|---|---|---|
| `useApiGet` | `useApiGet<T>(service, path, options?)` | SWR wrapper with API client fetcher, supports params, enabled flag, SWR config |
| `useApiMutation` | `useApiMutation<TData, TBody>(service, path, method?, invalidateKeys?)` | POST/PUT/PATCH/DELETE wrapper with SWR cache invalidation, loading/error states |

### Design Tokens (`globals.css`)

Comprehensive CSS custom property palette mapped to Tailwind v4 via `@theme inline`:
- **Colors:** background, foreground, card, popover, primary, secondary, muted, accent, destructive, success, warning (each with `-foreground` variant)
- **UI:** border, input, ring
- **Sidebar:** sidebar-background, sidebar-foreground, sidebar-primary, sidebar-accent, sidebar-border
- **Charts:** chart-1 through chart-5
- **Radius:** radius-sm, radius-md, radius-lg, radius-xl (derived from base `--radius`)
- **Dark mode:** Full override via `@media (prefers-color-scheme: dark)`

## Planned Technology (Not Yet Installed)

These libraries are specified in the design doc but not yet added to the project:

- **Excel:** exceljs 4.x (client-side XLSX generation)
- **Code Editor:** Monaco Editor (JSON editing)

## Coding Conventions

1. **camelCase for JSON** — All JSON property names in API requests/responses use camelCase.
2. **App Router** — Next.js App Router convention (file-based routing under `app/`).
3. **Server Components by default** — Use server components for data fetching; client components (`'use client'`) only when interactivity is needed.
4. **Tailwind CSS v4** — Utility-first styling via `@tailwindcss/postcss` plugin. No separate Tailwind config file (v4 uses CSS-based configuration in `globals.css`).

## Environment Variables

Configured via `.env.local` file in the service root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NEXT_PUBLIC_EVENT_INGESTION_URL` | Event Ingestion Service base URL | `http://localhost:3151` |
| `NEXT_PUBLIC_NOTIFICATION_ENGINE_URL` | Notification Engine Service base URL | `http://localhost:3152` |
| `NEXT_PUBLIC_TEMPLATE_SERVICE_URL` | Template Service base URL | `http://localhost:3153` |
| `NEXT_PUBLIC_CHANNEL_ROUTER_URL` | Channel Router Service base URL | `http://localhost:3154` |
| `NEXT_PUBLIC_ADMIN_SERVICE_URL` | Admin Service base URL | `http://localhost:3155` |
| `NEXT_PUBLIC_AUDIT_SERVICE_URL` | Audit Service base URL | `http://localhost:3156` |
| `NEXT_PUBLIC_BULK_UPLOAD_URL` | Bulk Upload Service base URL | `http://localhost:3158` |
| `NEXT_PUBLIC_APP_NAME` | Application name in header/title | `Notification API` |
| `NEXT_PUBLIC_POLLING_INTERVAL_DASHBOARD` | Dashboard metrics polling interval (ms) | `30000` |
| `NEXT_PUBLIC_POLLING_INTERVAL_UPLOAD` | Bulk upload status polling interval (ms) | `5000` |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB` | Maximum XLSX file size | `10` |
| `NEXT_PUBLIC_MAX_UPLOAD_ROWS` | Maximum rows per XLSX upload | `5000` |
| `NEXT_PUBLIC_DEBOUNCE_SEARCH_MS` | Search input debounce delay (ms) | `300` |
| `NEXT_PUBLIC_DEBOUNCE_PREVIEW_MS` | Template preview debounce delay (ms) | `500` |
| `NEXT_PUBLIC_DEFAULT_PAGE_SIZE` | Default pagination size | `50` |
| `PORT` | Server listening port | `3159` |
| `NODE_ENV` | Node environment | `development` |
| `NODE_OPTIONS` | Node.js runtime flags (heap size for Turbopack) | `--max-old-space-size=4096` |

## Related Services

- event-ingestion-service (:3151) — event mappings CRUD, test mapping
- notification-engine-service (:3152) — rules, recipient groups, notifications
- template-service (:3153) — template CRUD, rendering preview, versioning
- channel-router-service (:3154) — channel config, provider management
- admin-service (:3155) — system configuration
- audit-service (:3156) — dashboard analytics, notification logs, traces, delivery receipts
- bulk-upload-service (:3158) — XLSX upload, processing status, result download
