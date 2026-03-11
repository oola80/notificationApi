-- =============================================================================
-- Seed: Order Delay BR Max Notification Template
-- Schema: template_service
-- =============================================================================
-- Inserts the "order-delay-br-max" template with WhatsApp and Email channels.
-- Uses CTEs for deterministic UUID referencing within a single transaction.
-- MAX brand design (Guatemala) with red header, progress tracker, seller info.
--
-- Run once against the database after template_service tables exist:
--   psql -U template_service_user -d postgres -f seed-order-delay-br-max-template.sql
--
-- Idempotent: will fail on duplicate slug constraint if already seeded.
-- =============================================================================

SET search_path TO template_service;

BEGIN;

-- Step 1: Insert master template record (current_version_id set later)
WITH ins_template AS (
    INSERT INTO templates (slug, name, description, is_active, created_by, updated_by)
    VALUES (
        'order-delay-br-max',
        'Order Delay BR Max Notification',
        'Template for notifying MAX brand (Guatemala) customers about order delays. Channels: email, whatsapp. Includes newPromiseDate, sellerId, sellerName fields.',
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

-- Step 3a: Insert WhatsApp channel (with Meta template metadata for native template messages)
ins_whatsapp AS (
    INSERT INTO template_channels (template_version_id, channel, subject, body, metadata)
    SELECT id, 'whatsapp', NULL,
        'Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada. Nueva fecha estimada: {{newPromiseDate}}.',
        '{"metaTemplateName": "order_delay_br_max", "metaTemplateLanguage": "es_MX", "metaTemplateParameters": [{"name": "customer_name", "field": "customerName"}, {"name": "order_id", "field": "orderId"}, {"name": "new_promise_date", "field": "newPromiseDate"}]}'::jsonb
    FROM ins_version
    RETURNING id
),

-- Step 3b: Insert Email channel (MAX branded design)
ins_email AS (
    INSERT INTO template_channels (template_version_id, channel, subject, body)
    SELECT id, 'email',
        'Entrega retrasada — Orden {{orderId}} | MAX',
        '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Entrega retrasada — Orden {{orderId}}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">

          <!-- Header: Red bar with MAX logo + badge -->
          <tr>
            <td style="background-color:#cc0000; padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="color:#ffffff; font-size:28px; font-weight:bold; letter-spacing:2px;">MAX</span>
                  </td>
                  <td style="vertical-align:middle; text-align:right;">
                    <span style="background-color:#ffffff; color:#cc0000; font-size:12px; font-weight:bold; padding:6px 14px; border-radius:12px;">Entrega retrasada</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 32px 16px;">
              <p style="margin:0 0 8px; font-size:18px; color:#333333;">
                Hola <strong>{{customerName}}</strong>,
              </p>
              <p style="margin:0; font-size:15px; color:#555555;">
                Tu orden <strong>{{orderId}}</strong> presenta un retraso en la entrega.
              </p>
            </td>
          </tr>

          <!-- Delivery info: Carrier + Tracking -->
          <tr>
            <td style="padding:0 32px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9; border-radius:6px; padding:12px 16px;">
                <tr>
                  <td style="font-size:14px; color:#555555; padding:4px 16px;">
                    <strong>Transportista:</strong> {{carrierId}}
                  </td>
                  <td style="font-size:14px; color:#555555; padding:4px 16px; text-align:right;">
                    <strong>Guia:</strong> {{trackingNumber}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Progress tracker: 4 steps -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="text-align:center;">
                    <div style="width:32px; height:32px; border-radius:50%; background-color:#4caf50; color:#ffffff; font-size:14px; line-height:32px; margin:0 auto;">&#10003;</div>
                    <p style="margin:6px 0 0; font-size:11px; color:#4caf50; font-weight:bold;">Orden recibida</p>
                  </td>
                  <td width="25%" style="text-align:center;">
                    <div style="width:32px; height:32px; border-radius:50%; background-color:#cc0000; color:#ffffff; font-size:14px; line-height:32px; margin:0 auto;">!</div>
                    <p style="margin:6px 0 0; font-size:11px; color:#cc0000; font-weight:bold;">Entrega retrasada</p>
                  </td>
                  <td width="25%" style="text-align:center;">
                    <div style="width:32px; height:32px; border-radius:50%; background-color:#dddddd; color:#999999; font-size:14px; line-height:32px; margin:0 auto;">3</div>
                    <p style="margin:6px 0 0; font-size:11px; color:#999999;">En ruta</p>
                  </td>
                  <td width="25%" style="text-align:center;">
                    <div style="width:32px; height:32px; border-radius:50%; background-color:#dddddd; color:#999999; font-size:14px; line-height:32px; margin:0 auto;">4</div>
                    <p style="margin:6px 0 0; font-size:11px; color:#999999;">Entregado</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message body with new promise date -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff8f8; border-left:4px solid #cc0000; border-radius:4px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px; font-size:15px; color:#333333;">
                      Queremos informarte que tu orden <strong>{{orderId}}</strong> presenta un retraso en la entrega. La nueva fecha estimada de entrega es <strong>{{newPromiseDate}}</strong>.
                    </p>
                    <p style="margin:0; font-size:15px; color:#555555;">
                      {{message}}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:0 32px 24px; text-align:center;">
              <a href="tel:+50223333333" style="display:inline-block; background-color:#cc0000; color:#ffffff; font-size:16px; font-weight:bold; text-decoration:none; padding:14px 40px; border-radius:6px;">Llamar ahora</a>
            </td>
          </tr>

          <!-- Products section -->
          <tr>
            <td style="padding:0 32px 8px;">
              <h3 style="margin:0 0 4px; font-size:16px; color:#333333;">Productos en este envio</h3>
              <p style="margin:0 0 12px; font-size:13px; color:#777777;">Vendedor: {{sellerName}}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              {{#each items}}
              {{#if @first}}
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin-bottom:8px;">
                <tr style="background-color:#f0f0f0;">
                  <th style="text-align:left; font-size:13px; color:#333333; border-bottom:2px solid #dddddd; width:60px;">Imagen</th>
                  <th style="text-align:left; font-size:13px; color:#333333; border-bottom:2px solid #dddddd;">Producto</th>
                  <th style="text-align:center; font-size:13px; color:#333333; border-bottom:2px solid #dddddd; width:60px;">Cant.</th>
                  <th style="text-align:right; font-size:13px; color:#333333; border-bottom:2px solid #dddddd; width:80px;">Precio</th>
                </tr>
              {{/if}}
                <tr>
                  <td style="border-bottom:1px solid #eeeeee; vertical-align:middle;">
                    {{#if this.image}}<img src="{{this.image}}" alt="{{this.name}}" width="48" height="48" style="display:block; border-radius:4px;" />{{/if}}
                  </td>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee;">{{this.name}}</td>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:center;">{{this.quantity}}</td>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:right;">Q{{this.price}}</td>
                </tr>
              {{#if @last}}
              </table>
              {{/if}}
              {{/each}}
            </td>
          </tr>

          <!-- Help section -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9f9f9; border-radius:6px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px; font-size:15px; color:#333333; font-weight:bold;">Necesitas ayuda?</p>
                    <p style="margin:0; font-size:14px; color:#555555;">
                      Llamanos al <a href="tel:+50223333333" style="color:#cc0000; text-decoration:none;">2333-3333</a> o al <a href="tel:+50224444444" style="color:#cc0000; text-decoration:none;">2444-4444</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#333333; padding:16px 32px; text-align:center;">
              <p style="margin:0 0 4px; font-size:12px; color:#cccccc;">
                Este es un mensaje automatico, por favor no responda a este correo.
              </p>
              <p style="margin:0; font-size:11px; color:#999999;">
                max.com.gt
              </p>
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
        ('items',          'Array of order items (name, quantity, price, image)', false),
        ('promiseDate',    'Original estimated delivery date',            false),
        ('newPromiseDate', 'New estimated delivery date after delay',     false),
        ('trackingURL',    'Tracking URL for the shipment',               false),
        ('trackingNumber', 'Carrier tracking number',                     false),
        ('carrierId',      'Carrier identifier',                          false),
        ('sellerId',       'Seller identifier',                           false),
        ('sellerName',     'Seller display name',                         false),
        ('images',         'Array of product image objects',              false)
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
-- WHERE t.slug = 'order-delay-br-max';
-- =============================================================================
