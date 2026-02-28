# Auth RBAC Service Frontend

Next.js admin frontend — management interface for the centralized authentication and RBAC system (applications, users, roles, permissions).

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3161 |
| **Technology** | Next.js 14 (TypeScript, App Router) |
| **DB Schema** | None (frontend — all data via API) |

## API Backend

All data is fetched from the Auth RBAC Service Backend (:3160) API.

## Dependencies

- auth-rbac-service-backend (:3160) — sole API backend

## Related Services

- Consumes API from: auth-rbac-service-backend (:3160)
- Authenticated via: ecommerce-backoffice (:3162) — app-scoped JWT redirect
- No direct access to any other microservice

## Key References

- Design doc: `docs/20-auth-rbac-service-frontend.md` (convenience copy) — authoritative at `../../docs/20-auth-rbac-service-frontend.md`
- Routes: `../../endpoints/endpoints-auth-rbac-service-frontend.md`

## Coding Conventions

- Follow Next.js 14 App Router conventions (app/ directory, layout.tsx, page.tsx, loading.tsx, error.tsx)
- Use server components by default; client components only when interactivity is needed
- Use SWR for data fetching and caching
- Use Tailwind CSS for styling
- Form validation with React Hook Form + Zod
- All API calls go through a centralized API client with auth header injection

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

## Planned Folder Structure

```
auth-rbac-service-frontend/
  src/
    app/                     # Next.js App Router pages
      page.tsx               # Token receipt / redirect
      applications/          # Application list, create, detail/edit
      users/                 # User list, create, detail/edit
      layout.tsx
    components/              # Shared UI components
      layout/                # Sidebar, header
      applications/          # Application-related components
      users/                 # User-related components
      common/                # Reusable components (tables, pagination, dialogs)
    lib/                     # Utilities, API client, auth provider
    hooks/                   # Custom React hooks
    types/                   # TypeScript type definitions
    styles/                  # Global styles, Tailwind config
  public/
  docs/
```
