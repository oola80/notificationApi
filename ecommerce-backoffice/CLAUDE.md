# eCommerce Backoffice

Next.js login portal and application launcher — centralized entry point for all eCommerce platform applications.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3162 |
| **Technology** | Next.js 14 (TypeScript, App Router) |
| **DB Schema** | None (frontend — all data via API) |

## API Backend

All data is fetched from the Auth RBAC Service Backend (:3160) API.

## Dependencies

- auth-rbac-service-backend (:3160) — sole API backend

## Related Services

- Consumes API from: auth-rbac-service-backend (:3160)
- Redirects to: notification-admin-ui (:3159), auth-rbac-service-frontend (:3161), and other registered application frontends
- No direct access to any other microservice

## Key References

- Design doc: `docs/21-ecommerce-backoffice.md` (convenience copy) — authoritative at `../../docs/21-ecommerce-backoffice.md`
- Routes: `../../endpoints/endpoints-ecommerce-backoffice.md`

## Coding Conventions

- Follow Next.js 14 App Router conventions (app/ directory, layout.tsx, page.tsx, loading.tsx, error.tsx)
- Use server components by default; client components only when interactivity is needed
- Use Tailwind CSS for styling
- Form validation with React Hook Form + Zod
- All API calls go through a centralized API client
- Token stored in memory only (never localStorage/sessionStorage)

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

## Planned Folder Structure

```
ecommerce-backoffice/
  src/
    app/                     # Next.js App Router pages
      (auth)/                # Auth layout group (login, forgot-password, reset-password)
        login/
        forgot-password/
        reset-password/
      (dashboard)/           # Authenticated layout group
        apps/                # Application launcher grid
      layout.tsx
    components/              # Shared UI components
      auth/                  # Login form, password forms
      apps/                  # App card, app grid
      layout/                # Header
      common/                # Loading spinner, error message
    lib/                     # Utilities, API client, auth provider
    hooks/                   # Custom React hooks
    types/                   # TypeScript type definitions
    styles/                  # Global styles, Tailwind config
  public/
  docs/
```
