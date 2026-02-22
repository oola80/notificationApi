# Channel Router Service

Routes rendered notifications to delivery providers (SendGrid, Mailgun, Braze, Twilio, FCM) via provider strategy pattern; all providers are dumb pipes (pre-rendered content); retry/circuit breaker; priority-tiered delivery queues per channel.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3154 |
| **Technology** | NestJS (TypeScript) + provider SDKs (SendGrid, Mailgun, Twilio, Braze, FCM) |
| **DB Schema** | `channel_router_service` |
| **DB Role** | `channel_router_service_user_role` |
| **DB User** | `channel_router_service_user` |

## Database Tables

- Defined in the design doc: channel configurations, provider configurations, delivery attempts

## RabbitMQ

**Publishes to:**
- `xch.notifications.status` — delivery status updates (sent, delivered, failed, delivery-attempt.sent/failed/retrying, webhook.received)

**Consumes from:**
- `q.deliver.email.critical` — `notification.deliver.critical.email` (3 consumers, prefetch 5)
- `q.deliver.email.normal` — `notification.deliver.normal.email` (2 consumers, prefetch 10)
- `q.deliver.sms.critical` — `notification.deliver.critical.sms` (2 consumers, prefetch 5)
- `q.deliver.sms.normal` — `notification.deliver.normal.sms` (1 consumer, prefetch 10)
- `q.deliver.whatsapp.critical` — `notification.deliver.critical.whatsapp` (2 consumers, prefetch 5)
- `q.deliver.whatsapp.normal` — `notification.deliver.normal.whatsapp` (1 consumer, prefetch 10)
- `q.deliver.push.critical` — `notification.deliver.critical.push` (2 consumers, prefetch 5)
- `q.deliver.push.normal` — `notification.deliver.normal.push` (1 consumer, prefetch 10)

**Retry policies:** Email (5 retries, ~42.5 min), SMS (3 retries, ~2.5 min), WhatsApp (4 retries, ~12.5 min), Push (4 retries, ~12.5 min)

## Dependencies

- PostgreSQL, RabbitMQ
- External providers: SendGrid, Mailgun, Twilio, Braze, Firebase Cloud Messaging

## Related Services

- Upstream: notification-engine-service (:3152) dispatches delivery messages
- Downstream: audit-service (:3156) consumes status events
- Webhook sources: SendGrid, Mailgun, Twilio, Braze

## Key References

- Design doc: `docs/11-channel-router-service.md` (convenience copy) — authoritative at `../../docs/11-channel-router-service.md`
- Endpoints: `../../endpoints/endpoints-channel-router-service.md`
- DB schema script: `dbscripts/schema-channel-router-service.sql`
- DB objects script: `dbscripts/channel-router-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- Use strategy pattern for provider implementations (one strategy per provider)
- All providers are dumb pipes — content is pre-rendered, no provider-side templating
- Implement circuit breaker per provider
- All consumer handlers must be idempotent
- Webhook signature verification is mandatory for all provider callbacks

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "CRS-001", "details": "PROVIDER_UNAVAILABLE", "message": "SendGrid circuit breaker is open", "status": 503 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `CRS-` for Channel Router Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
channel-router-service/
  src/
    main.ts
    app.module.ts
    delivery/                # Delivery orchestration module
    providers/               # Provider strategy implementations
      sendgrid/
      mailgun/
      twilio/
      braze/
      fcm/
    webhooks/                # Provider webhook handlers (signature verification)
    channels/                # Channel configuration module
    consumers/               # RabbitMQ consumer handlers (8 queues)
    circuit-breaker/         # Circuit breaker module
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
