#!/usr/bin/env bash
# =============================================================================
# Seed: Order Delay BR Max Template + Notification Rule
# =============================================================================
# Creates the "order-delay-br-max" template via template-service API and then
# creates a matching notification rule in notification-engine-service.
#
# Prerequisites:
#   - template-service running on port 3153
#   - notification-engine-service running on port 3152
#   - curl and jq installed
#
# Usage:
#   bash seed-order-delay-br-max-data.sh
#   bash seed-order-delay-br-max-data.sh --template-host localhost:3153 --engine-host localhost:3152
# =============================================================================

set -euo pipefail

TEMPLATE_HOST="${TEMPLATE_HOST:-localhost:3153}"
ENGINE_HOST="${ENGINE_HOST:-localhost:3152}"

# Parse optional CLI args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --template-host) TEMPLATE_HOST="$2"; shift 2 ;;
    --engine-host)   ENGINE_HOST="$2";   shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== Seed: Order Delay BR Max Template + Notification Rule ==="
echo "  Template Service : ${TEMPLATE_HOST}"
echo "  Engine Service   : ${ENGINE_HOST}"
echo ""

# ---- Step 1: Create the template ----
echo "[1/2] Creating template 'order-delay-br-max' ..."

TEMPLATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${TEMPLATE_HOST}/api/v1/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "order-delay-br-max",
    "name": "Order Delay BR Max Notification",
    "description": "Template for notifying MAX brand (Guatemala) customers about order delays. Channels: email, whatsapp.",
    "createdBy": "seed-script",
    "channels": [
      {
        "channel": "whatsapp",
        "body": "Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada. Nueva fecha estimada: {{newPromiseDate}}.",
        "metadata": {
          "metaTemplateName": "order_delay_br_max",
          "metaTemplateLanguage": "es_MX",
          "metaTemplateParameters": [
            {"name": "customer_name", "field": "customerName"},
            {"name": "order_id", "field": "orderId"},
            {"name": "new_promise_date", "field": "newPromiseDate"}
          ]
        }
      },
      {
        "channel": "email",
        "subject": "Entrega retrasada — Orden {{orderId}} | MAX",
        "body": "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Entrega retrasada — Orden {{orderId}}</title>\n</head>\n<body style=\"margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;\">\n  <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f4f4f4;\">\n    <tr>\n      <td align=\"center\" style=\"padding:20px 0;\">\n        <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#ffffff; border-radius:8px; overflow:hidden;\">\n\n          <!-- Header: Red bar with MAX logo + badge -->\n          <tr>\n            <td style=\"background-color:#cc0000; padding:24px 32px;\">\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n                <tr>\n                  <td style=\"vertical-align:middle;\">\n                    <span style=\"color:#ffffff; font-size:28px; font-weight:bold; letter-spacing:2px;\">MAX</span>\n                  </td>\n                  <td style=\"vertical-align:middle; text-align:right;\">\n                    <span style=\"background-color:#ffffff; color:#cc0000; font-size:12px; font-weight:bold; padding:6px 14px; border-radius:12px;\">Entrega retrasada</span>\n                  </td>\n                </tr>\n              </table>\n            </td>\n          </tr>\n\n          <!-- Greeting -->\n          <tr>\n            <td style=\"padding:32px 32px 16px;\">\n              <p style=\"margin:0 0 8px; font-size:18px; color:#333333;\">Hola <strong>{{customerName}}</strong>,</p>\n              <p style=\"margin:0; font-size:15px; color:#555555;\">Tu orden <strong>{{orderId}}</strong> presenta un retraso en la entrega.</p>\n            </td>\n          </tr>\n\n          <!-- Delivery info -->\n          <tr>\n            <td style=\"padding:0 32px 16px;\">\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f9f9f9; border-radius:6px; padding:12px 16px;\">\n                <tr>\n                  <td style=\"font-size:14px; color:#555555; padding:4px 16px;\"><strong>Transportista:</strong> {{carrierId}}</td>\n                  <td style=\"font-size:14px; color:#555555; padding:4px 16px; text-align:right;\"><strong>Guia:</strong> {{trackingNumber}}</td>\n                </tr>\n              </table>\n            </td>\n          </tr>\n\n          <!-- Progress tracker -->\n          <tr>\n            <td style=\"padding:0 32px 24px;\">\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">\n                <tr>\n                  <td width=\"25%\" style=\"text-align:center;\"><div style=\"width:32px; height:32px; border-radius:50%; background-color:#4caf50; color:#ffffff; font-size:14px; line-height:32px; margin:0 auto;\">&#10003;</div><p style=\"margin:6px 0 0; font-size:11px; color:#4caf50; font-weight:bold;\">Orden recibida</p></td>\n                  <td width=\"25%\" style=\"text-align:center;\"><div style=\"width:32px; height:32px; border-radius:50%; background-color:#cc0000; color:#ffffff; font-size:14px; line-height:32px; margin:0 auto;\">!</div><p style=\"margin:6px 0 0; font-size:11px; color:#cc0000; font-weight:bold;\">Entrega retrasada</p></td>\n                  <td width=\"25%\" style=\"text-align:center;\"><div style=\"width:32px; height:32px; border-radius:50%; background-color:#dddddd; color:#999999; font-size:14px; line-height:32px; margin:0 auto;\">3</div><p style=\"margin:6px 0 0; font-size:11px; color:#999999;\">En ruta</p></td>\n                  <td width=\"25%\" style=\"text-align:center;\"><div style=\"width:32px; height:32px; border-radius:50%; background-color:#dddddd; color:#999999; font-size:14px; line-height:32px; margin:0 auto;\">4</div><p style=\"margin:6px 0 0; font-size:11px; color:#999999;\">Entregado</p></td>\n                </tr>\n              </table>\n            </td>\n          </tr>\n\n          <!-- Message body -->\n          <tr>\n            <td style=\"padding:0 32px 24px;\">\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#fff8f8; border-left:4px solid #cc0000; border-radius:4px;\">\n                <tr>\n                  <td style=\"padding:16px 20px;\">\n                    <p style=\"margin:0 0 8px; font-size:15px; color:#333333;\">Queremos informarte que tu orden <strong>{{orderId}}</strong> presenta un retraso en la entrega. La nueva fecha estimada de entrega es <strong>{{newPromiseDate}}</strong>.</p>\n                    <p style=\"margin:0; font-size:15px; color:#555555;\">{{message}}</p>\n                  </td>\n                </tr>\n              </table>\n            </td>\n          </tr>\n\n          <!-- CTA Button -->\n          <tr>\n            <td style=\"padding:0 32px 24px; text-align:center;\">\n              <a href=\"tel:+50223333333\" style=\"display:inline-block; background-color:#cc0000; color:#ffffff; font-size:16px; font-weight:bold; text-decoration:none; padding:14px 40px; border-radius:6px;\">Llamar ahora</a>\n            </td>\n          </tr>\n\n          <!-- Products section -->\n          <tr>\n            <td style=\"padding:0 32px 8px;\">\n              <h3 style=\"margin:0 0 4px; font-size:16px; color:#333333;\">Productos en este envio</h3>\n              <p style=\"margin:0 0 12px; font-size:13px; color:#777777;\">Vendedor: {{sellerName}}</p>\n            </td>\n          </tr>\n          <tr>\n            <td style=\"padding:0 32px 24px;\">\n              {{#each items}}\n              {{#if @first}}\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse; margin-bottom:8px;\">\n                <tr style=\"background-color:#f0f0f0;\">\n                  <th style=\"text-align:left; font-size:13px; color:#333333; border-bottom:2px solid #dddddd; width:60px;\">Imagen</th>\n                  <th style=\"text-align:left; font-size:13px; color:#333333; border-bottom:2px solid #dddddd;\">Producto</th>\n                  <th style=\"text-align:center; font-size:13px; color:#333333; border-bottom:2px solid #dddddd; width:60px;\">Cant.</th>\n                  <th style=\"text-align:right; font-size:13px; color:#333333; border-bottom:2px solid #dddddd; width:80px;\">Precio</th>\n                </tr>\n              {{/if}}\n                <tr>\n                  <td style=\"border-bottom:1px solid #eeeeee; vertical-align:middle;\">{{#if this.image}}<img src=\"{{this.image}}\" alt=\"{{this.name}}\" width=\"48\" height=\"48\" style=\"display:block; border-radius:4px;\" />{{/if}}</td>\n                  <td style=\"font-size:14px; color:#555555; border-bottom:1px solid #eeeeee;\">{{this.name}}</td>\n                  <td style=\"font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:center;\">{{this.quantity}}</td>\n                  <td style=\"font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:right;\">Q{{this.price}}</td>\n                </tr>\n              {{#if @last}}\n              </table>\n              {{/if}}\n              {{/each}}\n            </td>\n          </tr>\n\n          <!-- Help section -->\n          <tr>\n            <td style=\"padding:0 32px 24px;\">\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f9f9f9; border-radius:6px;\">\n                <tr>\n                  <td style=\"padding:16px 20px;\">\n                    <p style=\"margin:0 0 8px; font-size:15px; color:#333333; font-weight:bold;\">Necesitas ayuda?</p>\n                    <p style=\"margin:0; font-size:14px; color:#555555;\">Llamanos al <a href=\"tel:+50223333333\" style=\"color:#cc0000; text-decoration:none;\">2333-3333</a> o al <a href=\"tel:+50224444444\" style=\"color:#cc0000; text-decoration:none;\">2444-4444</a></p>\n                  </td>\n                </tr>\n              </table>\n            </td>\n          </tr>\n\n          <!-- Footer -->\n          <tr>\n            <td style=\"background-color:#333333; padding:16px 32px; text-align:center;\">\n              <p style=\"margin:0 0 4px; font-size:12px; color:#cccccc;\">Este es un mensaje automatico, por favor no responda a este correo.</p>\n              <p style=\"margin:0; font-size:11px; color:#999999;\">max.com.gt</p>\n            </td>\n          </tr>\n\n        </table>\n      </td>\n    </tr>\n  </table>\n</body>\n</html>"
      }
    ]
  }')

# Separate body from HTTP status code
HTTP_CODE=$(echo "$TEMPLATE_RESPONSE" | tail -n1)
TEMPLATE_BODY=$(echo "$TEMPLATE_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ne 201 ]]; then
  echo "  FAILED (HTTP ${HTTP_CODE}):"
  echo "$TEMPLATE_BODY" | jq . 2>/dev/null || echo "$TEMPLATE_BODY"
  exit 1
fi

TEMPLATE_ID=$(echo "$TEMPLATE_BODY" | jq -r '.id')

if [[ -z "$TEMPLATE_ID" || "$TEMPLATE_ID" == "null" ]]; then
  echo "  FAILED: Could not extract template ID from response."
  echo "$TEMPLATE_BODY" | jq . 2>/dev/null || echo "$TEMPLATE_BODY"
  exit 1
fi

echo "  OK — template ID: ${TEMPLATE_ID}"

# ---- Step 2: Create the notification rule ----
echo "[2/2] Creating notification rule 'Order Delay BR Max — Email + WhatsApp' ..."

RULE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${ENGINE_HOST}/api/v1/rules" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Order Delay BR Max — Email + WhatsApp\",
    \"eventType\": \"order.delay.br.max\",
    \"actions\": [
      {
        \"templateId\": \"${TEMPLATE_ID}\",
        \"channels\": [\"email\", \"whatsapp\"],
        \"recipientType\": \"customer\"
      }
    ],
    \"deliveryPriority\": \"normal\",
    \"priority\": 100,
    \"isExclusive\": false,
    \"createdBy\": \"seed-script\"
  }")

HTTP_CODE=$(echo "$RULE_RESPONSE" | tail -n1)
RULE_BODY=$(echo "$RULE_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ne 201 ]]; then
  echo "  FAILED (HTTP ${HTTP_CODE}):"
  echo "$RULE_BODY" | jq . 2>/dev/null || echo "$RULE_BODY"
  exit 1
fi

RULE_ID=$(echo "$RULE_BODY" | jq -r '.id')

if [[ -z "$RULE_ID" || "$RULE_ID" == "null" ]]; then
  echo "  FAILED: Could not extract rule ID from response."
  echo "$RULE_BODY" | jq . 2>/dev/null || echo "$RULE_BODY"
  exit 1
fi

echo "  OK — rule ID: ${RULE_ID}"

# ---- Summary ----
echo ""
echo "=== Seed complete ==="
echo "  Template ID : ${TEMPLATE_ID}"
echo "  Rule ID     : ${RULE_ID}"
echo ""
echo "Verify:"
echo "  curl http://${TEMPLATE_HOST}/api/v1/templates/${TEMPLATE_ID}"
echo "  curl http://${ENGINE_HOST}/api/v1/rules/${RULE_ID}"
