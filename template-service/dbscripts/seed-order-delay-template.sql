-- =============================================================================
-- Seed: Order Delay Notification Template
-- Schema: template_service
-- =============================================================================
-- Inserts the "order-delay" template with WhatsApp and Email channels.
-- Uses CTEs for deterministic UUID referencing within a single transaction.
--
-- Run once against the database after template_service tables exist:
--   psql -U template_service_user -d postgres -f seed-order-delay-template.sql
--
-- Idempotent: will fail on duplicate slug constraint if already seeded.
-- =============================================================================

SET search_path TO template_service;

BEGIN;

-- Step 1: Insert master template record (current_version_id set later)
WITH ins_template AS (
    INSERT INTO templates (slug, name, description, is_active, created_by, updated_by)
    VALUES (
        'order-delay',
        'Order Delay Notification',
        'Template for notifying customers about order delays. Channels: email, whatsapp.',
        true,
        'seed-script',
        'seed-script'
    )
    RETURNING id
),

-- Step 2: Insert version 1
ins_version AS (
    INSERT INTO template_versions (template_id, version_number, change_summary, created_by)
    SELECT id, 1, 'Initial version', 'seed-script'
    FROM ins_template
    RETURNING id, template_id
),

-- Step 3a: Insert WhatsApp channel
ins_whatsapp AS (
    INSERT INTO template_channels (template_version_id, channel, subject, body)
    SELECT id, 'whatsapp', NULL,
        'Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada.'
    FROM ins_version
    RETURNING id
),

-- Step 3b: Insert Email channel
ins_email AS (
    INSERT INTO template_channels (template_version_id, channel, subject, body)
    SELECT id, 'email',
        'Aviso de retraso en su orden {{orderId}}',
        '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aviso de retraso en su orden</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#d9534f; padding:24px 32px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:22px;">Aviso de retraso en su orden</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px; font-size:16px; color:#333333;">
                Hola <strong>{{customerName}}</strong>,
              </p>
              <p style="margin:0 0 16px; font-size:15px; color:#555555;">
                Lamentamos informarle que su orden <strong>{{orderId}}</strong> se encuentra retrasada.
              </p>
              <p style="margin:0 0 24px; font-size:15px; color:#555555;">
                {{message}}
              </p>

              <!-- Items table -->
              {{#each items}}
              {{#if @first}}
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin-bottom:24px;">
                <tr style="background-color:#f0f0f0;">
                  <th style="text-align:left; font-size:14px; color:#333333; border-bottom:2px solid #dddddd;">Producto</th>
                  <th style="text-align:center; font-size:14px; color:#333333; border-bottom:2px solid #dddddd;">Cantidad</th>
                </tr>
              {{/if}}
                <tr>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee;">{{this.name}}</td>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:center;">{{this.quantity}}</td>
                </tr>
              {{#if @last}}
              </table>
              {{/if}}
              {{/each}}

              <p style="margin:0 0 8px; font-size:15px; color:#555555;">
                <strong>Fecha estimada de entrega:</strong> {{promiseDate}}
              </p>

              {{#if trackingURL}}
              <p style="margin:0 0 24px; font-size:15px; color:#555555;">
                <strong>Rastreo:</strong>
                <a href="{{trackingURL}}" style="color:#337ab7; text-decoration:none;">{{trackingNumber}}</a>
              </p>
              {{/if}}

              <p style="margin:0; font-size:14px; color:#999999;">
                Agradecemos su paciencia y comprension.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9f9; padding:16px 32px; text-align:center; font-size:12px; color:#999999;">
              Este es un mensaje automatico, por favor no responda a este correo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'
    FROM ins_version
    RETURNING id
),

-- Step 4: Insert template variables
ins_variables AS (
    INSERT INTO template_variables (template_id, variable_name, description, is_required)
    SELECT t.id, v.variable_name, v.description, v.is_required
    FROM ins_template t
    CROSS JOIN (VALUES
        ('customerName',   'Customer full name',                          true),
        ('orderId',        'Order identifier',                            true),
        ('message',        'Delay reason or additional message',          false),
        ('items',          'Array of order items (name, quantity)',        false),
        ('promiseDate',    'Estimated delivery date',                     false),
        ('trackingURL',    'Tracking URL for the shipment',               false),
        ('trackingNumber', 'Carrier tracking number',                     false)
    ) AS v(variable_name, description, is_required)
    RETURNING id
)

-- Step 5: Update current_version_id on the template
UPDATE templates
SET current_version_id = ins_version.id,
    updated_at = NOW()
FROM ins_version
WHERE templates.id = ins_version.template_id;

COMMIT;

-- =============================================================================
-- Verification query — run after seed to confirm:
-- =============================================================================
-- SELECT t.id AS template_id, t.slug, t.name,
--        tv.id AS version_id, tv.version_number,
--        tc.channel, tc.subject, LEFT(tc.body, 80) AS body_preview
-- FROM template_service.templates t
-- JOIN template_service.template_versions tv ON tv.template_id = t.id
-- JOIN template_service.template_channels tc ON tc.template_version_id = tv.id
-- WHERE t.slug = 'order-delay';
-- =============================================================================
