# 21 — eCommerce Backoffice

**Notification API — eCommerce Backoffice Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-27 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture & Integration Points](#3-architecture--integration-points)
4. [Authentication Flow](#4-authentication-flow)
5. [Session Management](#5-session-management)
6. [Page Specifications](#6-page-specifications)
7. [Component Architecture](#7-component-architecture)
8. [Routing Table](#8-routing-table)
9. [API Integration](#9-api-integration)
10. [Security Considerations](#10-security-considerations)

---

## 1. Service Overview

The eCommerce Backoffice is a lightweight Next.js application that serves as the centralized login portal and application launcher for the eCommerce platform. Users authenticate once through this portal, then launch any application they have access to. Each application launch issues an app-scoped JWT and redirects the user to the target application's frontend.

| Attribute | Value |
|---|---|
| **Technology** | Next.js 14 (TypeScript, App Router) |
| **Port** | `3162` |
| **Database** | None (frontend — all data via API) |
| **API Backend** | auth-rbac-service-backend (:3160) |
| **Source Repo Folder** | `ecommerce-backoffice/` |

### Responsibilities

1. **Login Portal:** Email/password authentication form that issues a platform JWT.
2. **Application Launcher:** Displays all applications the user has access to. Clicking an application requests an app-scoped token and redirects to the application's frontend URL.
3. **Password Recovery:** Forgot password and reset password flows.
4. **Session Management:** Proactive token refresh, session expiry detection, and logout.

> **Info:** **Single Entry Point**
>
> The ecommerce-backoffice is the single entry point for all platform users. No application has its own login page. Users always start here, authenticate, and then navigate to their target application.

---

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| Next.js 14 | React framework with App Router, server components, TypeScript |
| Tailwind CSS | Utility-first CSS framework for styling |
| React Hook Form | Form state management for login and password forms |
| Zod | Schema validation for form inputs |
| TypeScript | Type safety across the application |

---

## 3. Architecture & Integration Points

```
┌──────────────────────────────────────────────────────────┐
│                  ecommerce-backoffice :3162               │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Login   │  │  App Launcher│  │  Password Recovery │ │
│  │  Page    │  │  Grid        │  │  Pages             │ │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘ │
│       │               │                    │             │
└───────┼───────────────┼────────────────────┼─────────────┘
        │               │                    │
        │ POST /auth/   │ GET /auth/         │ POST /auth/
        │ login         │ app-token          │ forgot-password
        │               │                    │ reset-password
        ▼               ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│              auth-rbac-service-backend :3160              │
└──────────────────────────────────────────────────────────┘
        │
        │ App-scoped token redirect
        ▼
┌─────────────────────────────────────────────┐
│  Target Application Frontends               │
│  notification-admin-ui :3159                │
│  auth-rbac-service-frontend :3161           │
│  (future applications...)                   │
└─────────────────────────────────────────────┘
```

---

## 4. Authentication Flow

### 4.1 Login → App Launcher → Application Launch

```
┌──────────┐     ┌────────────────┐     ┌───────────────┐     ┌──────────────┐
│  User    │     │ ecommerce-     │     │ auth-rbac-    │     │ Target App   │
│  Browser │     │ backoffice     │     │ backend :3160 │     │ Frontend     │
└────┬─────┘     └───────┬────────┘     └──────┬────────┘     └──────┬───────┘
     │                   │                     │                     │
     │  Navigate to :3162│                     │                     │
     │──────────────────►│                     │                     │
     │                   │                     │                     │
     │  Login page       │                     │                     │
     │◄──────────────────│                     │                     │
     │                   │                     │                     │
     │  Submit login     │                     │                     │
     │  {email, password}│                     │                     │
     │──────────────────►│                     │                     │
     │                   │  POST /auth/login   │                     │
     │                   │────────────────────►│                     │
     │                   │  {accessToken, user,│                     │
     │                   │   applications}     │                     │
     │                   │◄────────────────────│                     │
     │                   │                     │                     │
     │  App launcher grid│                     │                     │
     │  (application     │                     │                     │
     │   cards)          │                     │                     │
     │◄──────────────────│                     │                     │
     │                   │                     │                     │
     │  Click app card   │                     │                     │
     │──────────────────►│                     │                     │
     │                   │  GET /auth/app-token│                     │
     │                   │  ?applicationId=X   │                     │
     │                   │────────────────────►│                     │
     │                   │  {appToken}         │                     │
     │                   │◄────────────────────│                     │
     │                   │                     │                     │
     │  Redirect to app  │                     │                     │
     │  {frontendUrl}    │                     │                     │
     │  ?token={appToken}│                     │                     │
     │◄──────────────────│                     │                     │
     │                   │                     │                     │
     │  Navigate to app  │                     │                     │
     │──────────────────────────────────────────────────────────────►│
     │                   │                     │                     │
```

---

## 5. Session Management

### 5.1 Token Storage

- **Platform Access Token:** Stored in memory (React state). Never persisted to localStorage or sessionStorage.
- **Refresh Token:** HTTP-only secure cookie set by auth-rbac-service-backend. Not accessible via JavaScript.

### 5.2 Proactive Token Refresh

- A timer checks platform token expiry every 60 seconds
- When remaining lifetime < 3 minutes (of 15-minute total), trigger `POST /auth/refresh`
- On success: update in-memory access token
- On failure: redirect to login page

### 5.3 Session Expiry

- If the platform token expires and refresh fails (e.g., refresh token also expired after 7 days), redirect to login page
- Clear all in-memory state
- Display "Session expired. Please log in again." message on login page

### 5.4 Logout

- `POST /auth/logout` to revoke refresh token
- Clear in-memory access token
- Clear refresh token cookie (handled by backend response)
- Redirect to login page

---

## 6. Page Specifications

### 6.1 Login Page

**Route:** `/login`

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ┌─────────────────┐                  │
│                    │  Company Logo   │                  │
│                    └─────────────────┘                  │
│                                                         │
│               eCommerce Backoffice                      │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │  Email                      │               │
│           │  [________________________] │               │
│           │                             │               │
│           │  Password                   │               │
│           │  [________________________] │               │
│           │                             │               │
│           │  [       Log In           ] │               │
│           │                             │               │
│           │  Forgot your password?      │               │
│           └─────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Form validation: email format, password required
- Error states: "Invalid email or password", "Account locked until {time}", "Account deactivated"
- On success: redirect to `/apps` (application launcher)

### 6.2 Forgot Password Page

**Route:** `/forgot-password`

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│               Forgot Password                           │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │  Email                      │               │
│           │  [________________________] │               │
│           │                             │               │
│           │  [   Send Reset Link      ] │               │
│           │                             │               │
│           │  ← Back to login            │               │
│           └─────────────────────────────┘               │
│                                                         │
│  On submit: always shows success message                │
│  "If an account exists with this email, you will        │
│   receive a password reset link."                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Submit: `POST /auth/forgot-password`
- Always shows success message (prevents email enumeration)

### 6.3 Reset Password Page

**Route:** `/reset-password`

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│               Reset Password                            │
│                                                         │
│           ┌─────────────────────────────┐               │
│           │  New Password               │               │
│           │  [________________________] │               │
│           │                             │               │
│           │  Confirm Password           │               │
│           │  [________________________] │               │
│           │                             │               │
│           │  Password requirements:     │               │
│           │  ✓ 12+ characters           │               │
│           │  ✓ 1 uppercase letter       │               │
│           │  ✓ 1 lowercase letter       │               │
│           │  ✓ 1 digit                  │               │
│           │  ✓ 1 special character      │               │
│           │                             │               │
│           │  [   Reset Password       ] │               │
│           └─────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Receives `?token={resetToken}` from email link
- Real-time password strength validation
- Submit: `POST /auth/reset-password`
- On success: redirect to `/login` with success message

### 6.4 Application Launcher Page

**Route:** `/apps`

```
┌─────────────────────────────────────────────────────────┐
│  eCommerce Backoffice              John Admin  [Logout] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Your Applications                                      │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  📋             │  │  🔐             │              │
│  │  Notification   │  │  Auth & RBAC   │              │
│  │  API            │  │  Admin          │              │
│  │                 │  │                 │              │
│  │  Manage notif-  │  │  Manage users, │              │
│  │  ication rules, │  │  roles, and    │              │
│  │  templates, and │  │  application   │              │
│  │  channels       │  │  access        │              │
│  │                 │  │                 │              │
│  │  [  Launch  ]   │  │  [  Launch  ]  │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
│  ┌─────────────────┐                                   │
│  │  📦             │                                   │
│  │  Inventory      │                                   │
│  │  Management     │                                   │
│  │                 │                                   │
│  │  Track stock    │                                   │
│  │  levels and     │                                   │
│  │  manage orders  │                                   │
│  │                 │                                   │
│  │  [  Launch  ]   │                                   │
│  └─────────────────┘                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Fetches: `GET /auth/me` to get user profile and application list (from platform token claims)
- Each card shows application name, description, and a "Launch" button
- Launch flow: `GET /auth/app-token?applicationId={id}` → redirect to `{frontendUrl}?token={appToken}`
- Only shows applications the user has access to
- Empty state: "You don't have access to any applications. Contact your administrator."

---

## 7. Component Architecture

```
app/
  layout.tsx                    # Root layout
  (auth)/
    layout.tsx                  # Auth layout (centered card)
    login/
      page.tsx                  # Login form
    forgot-password/
      page.tsx                  # Forgot password form
    reset-password/
      page.tsx                  # Reset password form
  (dashboard)/
    layout.tsx                  # Dashboard layout (header + content)
    apps/
      page.tsx                  # Application launcher grid

components/
  auth/
    login-form.tsx              # Email/password form
    forgot-password-form.tsx    # Email form
    reset-password-form.tsx     # New password form with strength indicator
  apps/
    app-card.tsx                # Application card with launch button
    app-grid.tsx                # Grid of application cards
  layout/
    header.tsx                  # Top header with user info + logout
  common/
    loading-spinner.tsx         # Loading indicator
    error-message.tsx           # Error display

lib/
  api-client.ts                 # Centralized API client
  auth-provider.tsx             # React context for session management
  types.ts                      # TypeScript interfaces
```

---

## 8. Routing Table

| Route | Page | Access |
|-------|------|--------|
| `/login` | Login form | Public |
| `/forgot-password` | Forgot password form | Public |
| `/reset-password` | Reset password form | Public (requires valid reset token) |
| `/apps` | Application launcher grid | Authenticated (platform token) |

### Route Protection

- `/apps` requires a valid platform access token
- If no token: redirect to `/login`
- If token expired and refresh fails: redirect to `/login` with "session expired" message
- `/login`, `/forgot-password`, `/reset-password` are public — if user has valid session, redirect to `/apps`

---

## 9. API Integration

### Endpoint Mapping

| UI Action | API Endpoint |
|-----------|-------------|
| Login | `POST /auth/login` |
| Refresh token | `POST /auth/refresh` |
| Logout | `POST /auth/logout` |
| Forgot password | `POST /auth/forgot-password` |
| Reset password | `POST /auth/reset-password` |
| Get user profile | `GET /auth/me` |
| Request app token | `GET /auth/app-token?applicationId={id}` |

---

## 10. Security Considerations

1. **Token Storage:** Platform tokens stored only in memory (React state). Never in localStorage, sessionStorage, or cookies accessible to JavaScript.
2. **Refresh Token:** HTTP-only, Secure, SameSite=Strict cookie. Not accessible to JavaScript.
3. **HTTPS Only:** All communication over HTTPS in production.
4. **CSRF Protection:** SameSite=Strict cookie attribute prevents CSRF attacks.
5. **XSS Prevention:** React's built-in escaping. No `dangerouslySetInnerHTML`. Content Security Policy headers.
6. **App Token in URL:** The `?token=` query parameter is used only for the redirect. The target application should extract the token from the URL, store it in memory, and clear the URL (using `history.replaceState`).
7. **Error Messages:** Generic error messages for authentication failures. No distinction between "user not found" and "wrong password".

---

*Notification API — eCommerce Backoffice v1.0 — Architecture Team — 2026*
