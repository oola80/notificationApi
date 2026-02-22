# Email Ingest Service

SMTP ingest — receives emails from legacy/closed source systems, parses them against configurable rules, and generates standardized events for the notification pipeline.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3157 (REST) / 2525 (SMTP) |
| **Technology** | NestJS (TypeScript) + `smtp-server` npm package |
| **DB Schema** | `email_ingest_service` |
| **DB Role** | `email_ingest_service_user_role` |
| **DB User** | `email_ingest_service_user` |

## Database Tables

- `email_parsing_rules` — configurable rules mapping email criteria to event types (sender pattern, subject regex, body parsing config, event type, payload template)
- `processed_emails` — log of all received and parsed emails (audit trail: message_id, sender, subject, matched rule, extracted data, generated event, status)
- `email_sources` — registered source system identities (sender whitelist, auth config)

## RabbitMQ

**Publishes to:**
- `xch.events.incoming` — routing key `source.email-ingest.{eventType}` (parsed email events)

**Consumes from:** None (publishes after SMTP receipt/parsing)

## SMTP Configuration

- Port 2525, STARTTLS supported, optional SMTP AUTH (PLAIN/LOGIN)
- Max message size: 10 MB, max concurrent connections: 10

## Dependencies

- PostgreSQL, RabbitMQ

## Related Services

- Downstream: event-ingestion-service (:3151) consumes events via `xch.events.incoming`
- Managed by: admin-service (:3155) for parsing rule CRUD
- Proxied through: notification-gateway (:3150) for REST endpoints

## Key References

- Design doc: `docs/email-ingest-service-spec.md` (convenience copy) — authoritative at `../../docs/02-detailed-microservices.md` (Section 9)
- Endpoints: `../../endpoints/endpoints-email-ingest-service.md`
- DB schema script: `dbscripts/schema-email-ingest-service.sql`
- DB objects script: `dbscripts/email-ingest-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- Use `smtp-server` npm package for the embedded SMTP server
- Sender whitelisting is enforced at SMTP handshake level
- Regex patterns in parsing rules must be validated before persisting
- All received emails are logged regardless of parse outcome

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "EMI-001", "details": "INVALID_RULE", "message": "regex pattern is invalid", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `EMI-` for Email Ingest Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
email-ingest-service/
  src/
    main.ts
    app.module.ts
    smtp/                    # SMTP server module (smtp-server integration)
    parsing/                 # Email parsing module (rule engine, extraction)
    parsing-rules/           # Parsing rule CRUD module
    processed-emails/        # Processed email query module
    sources/                 # Email source whitelist management
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
