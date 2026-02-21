# 04 — Authentication & Identity

**Notification API — Authentication, SSO & Session Management**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Authentication Overview](#1-authentication-overview)
2. [Local Authentication](#2-local-authentication)
3. [SAML 2.0 Single Sign-On](#3-saml-20-single-sign-on)
4. [Session Management & Token Bridge](#4-session-management--token-bridge)
5. [Account Linking & User Provisioning](#5-account-linking--user-provisioning)
6. [Database Schema Additions](#6-database-schema-additions)
7. [API Endpoints](#7-api-endpoints)
8. [Frontend Integration](#8-frontend-integration)
9. [Configuration & Environment Variables](#9-configuration--environment-variables)
10. [Security Considerations](#10-security-considerations)

---

## 1. Authentication Overview

The Notification API platform supports two authentication methods for admin users: **Local Authentication** (username/password) and **SAML 2.0 Single Sign-On** with Azure AD. Both methods converge on a unified JWT session model — once authenticated, all downstream services receive the same JWT tokens regardless of how the user originally authenticated.

| Aspect | Local Authentication | SAML 2.0 SSO (Azure AD) |
|---|---|---|
| **Identity Source** | Platform's own `admin_users` table | Azure Active Directory |
| **Credential Storage** | bcrypt-hashed passwords in `admin_service` schema | No passwords stored — delegated to IdP |
| **Login Flow** | POST email/password to `/api/v1/auth/login` | SP-initiated redirect to Azure AD |
| **Session Token** | JWT (RS256) issued by platform | JWT (RS256) issued by platform after SAML assertion validation |
| **MFA** | Not included in Phase 1 (upgrade path available) | Enforced by Azure AD policies |
| **Use Case** | Default for environments without enterprise IdP | Enterprise environments with Azure AD |

> **Info:** **Unified JWT Model:** Regardless of whether a user authenticates via local credentials or SAML SSO, the platform issues its own JWT tokens. Downstream services (Notification Engine, Template Service, etc.) only see JWTs — they are completely unaware of the authentication method used. This design keeps the authentication boundary at the Gateway and Admin Service, with no SAML dependencies leaking into the rest of the system.

---

## 2. Local Authentication

Local authentication allows admin users to sign in using an email address and password managed directly by the platform. Credentials are validated against bcrypt-hashed passwords stored in the `admin_users` table.

### 2.1 Login Flow

1. User submits email and password to `POST /api/v1/auth/login`.
2. Gateway forwards the request to the Admin Service.
3. Admin Service looks up the user by email in `admin_users`.
4. If the account is locked (exceeded rate limit), return `429 Too Many Requests` with a `Retry-After` header.
5. bcrypt compares the submitted password against the stored `password_hash`.
6. On success: reset failed attempt counter, update `last_login_at`, issue JWT access token + refresh token.
7. On failure: increment failed attempt counter. After 5 failed attempts within 15 minutes, lock the account for 15 minutes.

### 2.2 Password Policy

| Rule | Requirement |
|---|---|
| Minimum length | 12 characters |
| Complexity | At least one uppercase, one lowercase, one digit, and one special character |
| Hashing algorithm | bcrypt with cost factor 12 |
| Password history | Cannot reuse last 5 passwords |
| Maximum age | 90 days (configurable) |

### 2.3 Rate Limiting

| Parameter | Value |
|---|---|
| Max failed attempts | 5 per account |
| Lockout window | 15 minutes |
| Lockout duration | 15 minutes (auto-unlock) |
| Global rate limit | 20 login requests/minute per IP |

### 2.4 Password Reset

1. User requests password reset via `POST /api/v1/auth/forgot-password` with their email.
2. System generates a cryptographically random token (32 bytes, hex-encoded), stores its SHA-256 hash with a 1-hour expiry.
3. A password reset email is sent via the platform's own email channel (SendGrid).
4. User submits new password with the token to `POST /api/v1/auth/reset-password`.
5. System validates the token, enforces password policy, updates the hash, and invalidates all existing sessions.

### 2.5 Refresh Token Rotation

Refresh tokens are stored as HTTP-only, Secure, SameSite=Strict cookies. Each time a refresh token is used to obtain a new access token, the old refresh token is invalidated and a new one is issued. This rotation strategy limits the window of exposure if a refresh token is compromised. If a previously-used refresh token is presented (replay detection), all tokens for that user are invalidated, forcing re-authentication.

---

## 3. SAML 2.0 Single Sign-On

The platform acts as a **SAML 2.0 Service Provider (SP)**, integrating with Azure AD (or any SAML 2.0-compliant Identity Provider) for enterprise single sign-on. Authentication is delegated to the IdP; the platform validates SAML assertions and issues its own JWT tokens. The implementation uses the `@node-saml/passport-saml` library.

### 3.1 SP Metadata Generation

The platform generates SP metadata XML at `GET /api/v1/auth/saml/metadata`. This metadata is imported into Azure AD to establish the trust relationship.

| SP Metadata Element | Value |
|---|---|
| `entityID` | Configurable (e.g., `https://notifications.example.com/saml`) |
| `AssertionConsumerService` | `POST /api/v1/auth/saml/acs` (HTTP-POST binding) |
| `SingleLogoutService` | `POST /api/v1/auth/saml/slo` (HTTP-POST binding) |
| `NameIDFormat` | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| Signing Certificate | SP's X.509 certificate for AuthnRequest signing |

### 3.2 IdP Metadata Import

Azure AD's federation metadata XML is imported via `POST /admin/saml/idp` (Super Admin only). The system parses the metadata and extracts:

- **entityID:** The IdP's unique identifier
- **SSO URL:** The IdP's SingleSignOnService endpoint (HTTP-Redirect or HTTP-POST)
- **SLO URL:** The IdP's SingleLogoutService endpoint
- **X.509 Certificate:** The IdP's signing certificate for assertion signature validation
- **NameID Format:** Expected NameID format from the IdP

### 3.3 SSO Flow (SP-Initiated)

```
SAML 2.0 SSO Flow (SP-Initiated)

Browser              Gateway / SP          Admin Service         Azure AD (IdP)
   |                      |                      |                      |
   |  1. Click "SSO"      |                      |                      |
   |--------------------->|                      |                      |
   |                      |  2. Generate          |                      |
   |                      |     AuthnRequest      |                      |
   |                      |--------------------->|                      |
   |                      |                      |                      |
   |                      |  3. Signed AuthnReq   |                      |
   |                      |     + IdP SSO URL     |                      |
   |                      |<---------------------|                      |
   |                      |                      |                      |
   |  4. 302 Redirect     |                      |                      |
   |<---------------------|                      |                      |
   |                      |                      |                      |
   |  5. AuthnRequest (HTTP-Redirect / HTTP-POST)                      |
   |------------------------------------------------------------------>|
   |                      |                      |                      |
   |                      |                      |    6. User            |
   |                      |                      |    authenticates     |
   |                      |                      |    at IdP            |
   |                      |                      |                      |
   |  7. SAML Response (HTTP-POST to ACS)                              |
   |<------------------------------------------------------------------|
   |                      |                      |                      |
   |  8. POST SAML        |                      |                      |
   |     Response to ACS  |                      |                      |
   |--------------------->|                      |                      |
   |                      |  9. Validate          |                      |
   |                      |     assertion,        |                      |
   |                      |     link/create user  |                      |
   |                      |--------------------->|                      |
   |                      |                      |                      |
   |                      | 10. User record       |                      |
   |                      |     + session index   |                      |
   |                      |<---------------------|                      |
   |                      |                      |                      |
   | 11. JWT access token |                      |                      |
   |     + refresh cookie |                      |                      |
   |<---------------------|                      |                      |
   |                      |                      |                      |
   | 12. Redirect to      |                      |                      |
   |     /dashboard       |                      |                      |
   |                      |                      |                      |
```

### 3.4 Assertion Validation

Every SAML assertion received at the ACS endpoint is validated against the following checks before a JWT is issued:

| Validation Check | Description | Failure Action |
|---|---|---|
| **Signature Verification** | Verify the assertion or response signature using the IdP's X.509 certificate | Reject — return 401 |
| **Audience Restriction** | Assertion `Audience` must match the SP's `entityID` | Reject — return 401 |
| **Time Conditions** | Current time must be within `NotBefore` and `NotOnOrAfter` (with configurable clock skew tolerance) | Reject — return 401 |
| **InResponseTo** | Response must reference a valid, pending AuthnRequest ID from the SP | Reject — return 401 (prevents unsolicited response attacks) |
| **Recipient** | `Recipient` attribute must match the ACS URL | Reject — return 401 |
| **Issuer** | `Issuer` must match the configured IdP `entityID` | Reject — return 401 |
| **Replay Prevention** | Assertion ID must not have been seen before (tracked in cache with TTL matching assertion validity) | Reject — return 401 |

> **Warning:** **Library:** SAML processing is handled by `@node-saml/passport-saml`, which implements the above validations. The library handles XML signature verification, condition evaluation, and assertion parsing. Custom validation hooks are added for replay detection and account linking.

---

## 4. Session Management & Token Bridge

Both authentication methods produce the same JWT token structure. SAML authenticates the user; the platform then issues its own JWT. The SAML session index is stored for Single Logout (SLO) support.

### 4.1 JWT Claims

```json
{
  "sub": "uuid-of-admin-user",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "admin",
  "permissions": ["rules:read", "rules:write", "templates:read"],
  "auth_method": "local | saml",
  "idp_id": "uuid-of-idp | null",
  "iat": 1708300800,
  "exp": 1708301700,
  "iss": "notification-api"
}
```

### 4.2 Session Lifecycle

| Action | Local Auth | SAML SSO |
|---|---|---|
| **Login** | POST credentials → validate → issue JWT + refresh token | SAML flow → validate assertion → issue JWT + refresh token + store session index |
| **Refresh** | Present refresh token → rotate → issue new JWT + refresh token | Same as local (JWT-based, independent of IdP) |
| **Logout** | Invalidate refresh token, clear cookie | Invalidate refresh token, clear cookie, delete SAML session record |
| **Single Logout (SLO)** | N/A | IdP sends LogoutRequest → SP invalidates all sessions for that NameID + session index → responds with LogoutResponse |

> **Info:** **Token Independence:** After the initial SAML authentication, the JWT-based session is independent of the IdP. Token refresh does not require communication with Azure AD. This ensures that the platform remains functional even if the IdP experiences temporary downtime (existing sessions continue to work; only new SSO logins are affected).

---

## 5. Account Linking & User Provisioning

When a user authenticates via SAML, the platform links the SAML identity (NameID) to a local `admin_users` record. The NameID format is `emailAddress`, matching against the `admin_users.email` column.

### 5.1 User Types

| Type | Description | `password_hash` | Login Methods |
|---|---|---|---|
| **Local-only** | User created manually, no IdP link | Set (bcrypt hash) | Email/password only |
| **SAML-only** | User provisioned via SAML (auto or manual), no local password | `NULL` | SSO only |
| **Hybrid** | Local user linked to a SAML identity | Set (bcrypt hash) | Email/password or SSO |

### 5.2 Auto-Provisioning

When enabled (per IdP configuration, default: **off**), the platform automatically creates a local `admin_users` record when a SAML user authenticates for the first time and no matching email is found. The auto-provisioned user is assigned a configurable default role (default: **[Viewer]**).

### 5.3 Attribute Mapping

Azure AD claims from the SAML assertion are mapped to local user fields:

| Azure AD Claim | SAML Attribute | Local Field |
|---|---|---|
| User Principal Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `admin_users.email` |
| Display Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `admin_users.full_name` |
| Given Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `admin_users.first_name` (optional) |
| Surname | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `admin_users.last_name` (optional) |
| Groups | `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` | Role mapping (configurable per IdP) |

---

## 6. Database Schema Additions

Three new tables are added to the `admin_service` schema to support SAML SSO. These extend the existing `admin_users`, `admin_roles`, and `admin_permissions` tables already defined in the [Admin Service specification](02-detailed-microservices.md#7-admin-service).

### 6.1 `saml_identity_providers`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique IdP identifier |
| `name` | VARCHAR(255) | Display name (e.g., "Corporate Azure AD") |
| `entity_id` | VARCHAR(512) UNIQUE | IdP entityID from metadata |
| `sso_url` | VARCHAR(1024) | IdP SSO endpoint URL |
| `slo_url` | VARCHAR(1024) | IdP SLO endpoint URL (nullable) |
| `certificate` | TEXT | IdP X.509 signing certificate (PEM) |
| `metadata_xml` | TEXT | Raw imported IdP metadata XML |
| `sp_entity_id` | VARCHAR(512) | SP entityID for this IdP configuration |
| `sp_certificate` | TEXT | SP signing certificate (PEM) |
| `sp_private_key_enc` | TEXT | SP private key (AES-256-GCM encrypted) |
| `attribute_mapping` | JSONB | Claim-to-field mapping configuration |
| `default_role_id` | UUID (FK → admin_roles) | Role assigned to auto-provisioned users |
| `auto_provision` | BOOLEAN | Auto-create users on first SSO login (default: false) |
| `is_active` | BOOLEAN | Enable/disable this IdP |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### 6.2 `user_identity_links`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Link identifier |
| `user_id` | UUID (FK → admin_users) | Local user account |
| `idp_id` | UUID (FK → saml_identity_providers) | Identity provider |
| `external_id` | VARCHAR(512) | NameID value from the IdP |
| `linked_at` | TIMESTAMPTZ | When the link was established |
| `last_login_at` | TIMESTAMPTZ | Last SSO login via this link |

**Unique constraint:** `(idp_id, external_id)` — each external identity maps to exactly one local user per IdP.

### 6.3 `saml_sessions`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Session record identifier |
| `user_id` | UUID (FK → admin_users) | Local user account |
| `idp_id` | UUID (FK → saml_identity_providers) | Identity provider |
| `session_index` | VARCHAR(512) | SAML SessionIndex from the assertion |
| `name_id` | VARCHAR(512) | SAML NameID for this session |
| `name_id_format` | VARCHAR(256) | NameID format URI |
| `created_at` | TIMESTAMPTZ | Session creation time |
| `expires_at` | TIMESTAMPTZ | Session expiry (matches refresh token expiry) |

Used for Single Logout (SLO) — when the IdP sends a LogoutRequest, the platform looks up sessions by `name_id` + `session_index` and invalidates the corresponding JWT refresh tokens.

---

## 7. API Endpoints

### 7.1 Local Authentication

**POST /api/v1/auth/login**
Authenticate with email and password. Returns JWT access token in response body and sets refresh token as HTTP-only cookie. Rate limited: 5 failed attempts per account per 15 minutes, 20 requests per IP per minute.
- Request: `{ "email": "string", "password": "string" }`
- Response (200): `{ "accessToken": "string", "expiresIn": 900, "user": { "id", "email", "name", "role" } }`
- Errors: 401 Invalid credentials, 429 Account locked / rate limited

**POST /api/v1/auth/refresh**
Exchange a valid refresh token (from HTTP-only cookie) for a new access token and rotated refresh token.
- Response (200): `{ "accessToken": "string", "expiresIn": 900 }`
- Errors: 401 Invalid or expired refresh token

**POST /api/v1/auth/logout**
Invalidate the current session. Revokes the refresh token and clears the cookie. For SAML sessions, also deletes the SAML session record.
- Response (204): No content

**POST /api/v1/auth/forgot-password**
Request a password reset email. Always returns 200 regardless of whether the email exists (prevents user enumeration).
- Request: `{ "email": "string" }`
- Response (200): `{ "message": "If an account exists, a reset email has been sent." }`

**POST /api/v1/auth/reset-password**
Set a new password using a valid reset token. Invalidates all existing sessions for the user.
- Request: `{ "token": "string", "newPassword": "string" }`
- Response (200): `{ "message": "Password has been reset." }`
- Errors: 400 Invalid/expired token, 422 Password does not meet policy

**POST /api/v1/auth/change-password**
Change password for the currently authenticated user. Requires the current password for verification. Not available for SAML-only users.
- Request: `{ "currentPassword": "string", "newPassword": "string" }`
- Response (200): `{ "message": "Password changed successfully." }`
- Errors: 400 Current password incorrect, 403 SAML-only account, 422 Password policy violation

### 7.2 SAML SSO

**GET /api/v1/auth/saml/login**
Initiate SP-initiated SAML SSO flow. Generates an AuthnRequest and redirects the browser to the IdP's SSO URL.
- Query parameter: `idp` (optional — IdP ID if multiple IdPs configured; defaults to the primary active IdP)
- Response (302): Redirect to Azure AD with AuthnRequest

**POST /api/v1/auth/saml/acs**
Assertion Consumer Service endpoint. Receives the SAML Response from the IdP (HTTP-POST binding), validates the assertion, links/creates the user, issues JWT tokens, and redirects to the frontend.
- Request: `application/x-www-form-urlencoded` with `SAMLResponse` and optional `RelayState`
- Response (302): Redirect to `/dashboard` (or RelayState URL) with refresh token cookie set
- Errors: 401 Assertion validation failed, 403 User not provisioned and auto-provision disabled

**GET /api/v1/auth/saml/metadata**
Returns the SP metadata XML document. Used to configure trust in the IdP (Azure AD Enterprise Application).
- Response (200): `application/xml` — SPSSODescriptor with entityID, ACS, SLO, NameIDFormat, and signing certificate

**POST /api/v1/auth/saml/slo**
Single Logout endpoint. Receives LogoutRequest from the IdP, invalidates all platform sessions associated with the NameID and session index, and responds with a LogoutResponse.
- Request: `application/x-www-form-urlencoded` with `SAMLRequest`
- Response (200): LogoutResponse or redirect

### 7.3 Current User

**GET /api/v1/auth/me**
Returns the currently authenticated user's profile and permissions. Used by the frontend to determine navigation and feature access.
- Response (200): `{ "id", "email", "fullName", "role", "permissions": [...], "authMethod": "local"|"saml", "lastLoginAt" }`

### 7.4 IdP Administration

**GET /admin/saml/idp**
List all configured SAML Identity Providers. **[Super Admin]** only.
- Response (200): Array of IdP configurations (certificate and private key fields redacted)

**POST /admin/saml/idp**
Register a new SAML Identity Provider. Accepts IdP metadata XML (file upload or URL fetch), parses it to extract entityID, SSO URL, SLO URL, and certificate. **[Super Admin]** only.
- Request: `{ "name": "string", "metadataXml": "string" | "metadataUrl": "string", "autoProvision": boolean, "defaultRoleId": "uuid", "attributeMapping": {...} }`
- Response (201): Created IdP configuration

**PUT /admin/saml/idp/:id**
Update an existing IdP configuration. Supports partial updates. Re-importing metadata XML will update the certificate and URLs. **[Super Admin]** only.

**DELETE /admin/saml/idp/:id**
Delete an IdP configuration. Fails if there are SAML-only users linked to this IdP (must migrate or delete users first). **[Super Admin]** only.
- Errors: 409 Conflict — SAML-only users still linked

---

## 8. Frontend Integration

### 8.1 Login Page

The login page (`/login`) presents two authentication options:

- **Email/Password Form:** Standard form with email and password fields, "Forgot password?" link, and a "Sign in" button. Form validation enforces email format and non-empty password.
- **"Sign in with SSO" Button:** Displayed when at least one active SAML IdP is configured. Clicking initiates the SP-initiated SSO flow by redirecting to `/api/v1/auth/saml/login`. If multiple IdPs are configured, a dropdown or selection modal is shown.

### 8.2 Identity Provider Settings Page

Available at `/settings/identity-providers`, restricted to **[Super Admin]** role. Features:

- List of configured IdPs with status indicators (active/inactive)
- "Add Identity Provider" button — opens a form with metadata XML upload (drag-and-drop or paste), name, auto-provisioning toggle, default role selector, and attribute mapping configuration
- Per-IdP detail view showing parsed metadata values, SP metadata download link, user count linked to this IdP, and test connection button
- IdP certificate expiry warnings

---

## 9. Configuration & Environment Variables

| Variable | Description | Default |
|---|---|---|
| `JWT_PRIVATE_KEY_PATH` | Path to RS256 private key for signing JWTs | `./keys/jwt-private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Path to RS256 public key for verifying JWTs | `./keys/jwt-public.pem` |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access token TTL | `15m` |
| `JWT_REFRESH_TOKEN_EXPIRY` | Refresh token TTL | `7d` |
| `BCRYPT_ROUNDS` | bcrypt cost factor | `12` |
| `LOGIN_RATE_LIMIT_MAX` | Max failed login attempts per account | `5` |
| `LOGIN_RATE_LIMIT_WINDOW` | Rate limit window duration | `15m` |
| `LOGIN_LOCKOUT_DURATION` | Account lockout duration after max attempts | `15m` |
| `SAML_SP_ENTITY_ID` | Default SP entityID for SAML metadata | `https://notifications.example.com/saml` |
| `SAML_SP_CERT_PATH` | Path to SP signing certificate | `./keys/saml-sp-cert.pem` |
| `SAML_SP_KEY_PATH` | Path to SP private key | `./keys/saml-sp-key.pem` |
| `SAML_CLOCK_SKEW_MS` | Allowed clock skew for assertion validation | `30000` (30s) |
| `PASSWORD_MAX_AGE_DAYS` | Maximum password age before forced reset | `90` |
| `PASSWORD_RESET_TOKEN_EXPIRY` | Password reset token TTL | `1h` |

---

## 10. Security Considerations

| Concern | Mitigation |
|---|---|
| **Assertion Signature Validation** | Mandatory for all SAML assertions. Unsigned or incorrectly signed assertions are rejected. The IdP certificate is stored per-IdP and validated on every assertion. |
| **Encrypted Assertions** | Recommended but not required. When the IdP supports assertion encryption, the SP's public key (from SP metadata) is used. The SP decrypts using its private key before validation. |
| **Clock Skew Tolerance** | Configurable tolerance (default 30 seconds) for assertion time conditions (`NotBefore` / `NotOnOrAfter`). Prevents valid assertions from being rejected due to minor time synchronization differences. |
| **Replay Prevention** | Assertion IDs are tracked in a time-bounded cache (TTL = assertion validity window). Duplicate assertion IDs are rejected. `InResponseTo` validation ensures assertions correspond to platform-initiated requests. |
| **SP Key Rotation** | SP signing keys can be rotated by generating a new keypair, updating the SP metadata, and re-importing into the IdP. During rotation, both old and new certificates are included in SP metadata to allow a transition window. |
| **IdP Certificate Rollover** | When Azure AD rotates its signing certificate, the admin re-imports the updated metadata XML. The platform supports multiple IdP certificates during the rollover period to prevent authentication disruption. |
| **CSRF Protection** | The ACS endpoint validates `InResponseTo` to prevent unsolicited SAML responses. The login form uses CSRF tokens. Refresh tokens use SameSite=Strict cookies. |
| **User Enumeration** | The forgot-password endpoint always returns the same response regardless of whether the email exists. Login error messages do not distinguish between "user not found" and "wrong password". |

> **Warning:** **Pre-Production Checklist:**
>
> - Generate production RS256 keypair for JWT signing (minimum 2048-bit RSA)
> - Generate production X.509 certificate and key for SAML SP signing
> - Configure Azure AD Enterprise Application with SP metadata
> - Test SAML SSO flow end-to-end in a staging environment
> - Verify assertion validation with clock skew edge cases
> - Conduct penetration testing on all auth endpoints
> - Review and tune rate limiting thresholds based on expected user base

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
