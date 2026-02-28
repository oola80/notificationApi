# Notification Admin UI

Next.js admin frontend — backoffice interface for managing the notification platform (rules, templates, channels, mappings, uploads, users, audit logs, system settings).

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3159 |
| **Technology** | Next.js 14 (TypeScript, App Router) |
| **DB Schema** | None (frontend — all data via API) |

## API Backend

All data is fetched from the admin-service (:3155) API directly. Authentication via app-scoped JWT from ecommerce-backoffice (:3162).

## Dependencies

- admin-service (:3155) — API backend for notification management operations
- ecommerce-backoffice (:3162) — login portal, provides app-scoped JWT via redirect

## Related Services

- Consumes API from: admin-service (:3155)
- Authenticated via: ecommerce-backoffice (:3162) → auth-rbac-service-backend (:3160)
- No direct access to any other microservice

## Key References

- Design doc: `docs/15-notification-admin-ui.md` (convenience copy) — authoritative at `../../docs/15-notification-admin-ui.md`
- Routes: `../../endpoints/endpoints-notification-admin-ui.md`

## Coding Conventions

- Follow Next.js 14 App Router conventions (app/ directory, layout.tsx, page.tsx, loading.tsx, error.tsx)
- Use server components by default; client components only when interactivity is needed
- Use TanStack Query (React Query) for server state management
- Use Tailwind CSS for styling
- Form validation with react-hook-form + zod
- All API calls go through a centralized API client (no direct fetch to downstream services)

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

## Planned Folder Structure

```
notification-admin-ui/
  src/
    app/                     # Next.js App Router pages
      (auth)/                # Auth layout group (login, forgot-password, reset-password)
      (dashboard)/           # Authenticated layout group
        dashboard/
        rules/
        templates/
        channels/
        logs/
        event-mappings/
        bulk-upload/
        recipient-groups/
        users/
        audit/
        settings/
      layout.tsx
    components/              # Shared UI components
    lib/                     # Utilities, API client, auth helpers
    hooks/                   # Custom React hooks
    types/                   # TypeScript type definitions
    styles/                  # Global styles, Tailwind config
  public/
  docs/
```
