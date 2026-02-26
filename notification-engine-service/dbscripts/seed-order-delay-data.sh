#!/usr/bin/env bash
# =============================================================================
# Seed: Order Delay Template + Notification Rule
# =============================================================================
# Creates the "order-delay" template via template-service API and then creates
# a matching notification rule in notification-engine-service.
#
# Prerequisites:
#   - template-service running on port 3153
#   - notification-engine-service running on port 3152
#   - curl and jq installed
#
# Usage:
#   bash seed-order-delay-data.sh
#   bash seed-order-delay-data.sh --template-host localhost:3153 --engine-host localhost:3152
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

echo "=== Seed: Order Delay Template + Notification Rule ==="
echo "  Template Service : ${TEMPLATE_HOST}"
echo "  Engine Service   : ${ENGINE_HOST}"
echo ""

# ---- Step 1: Create the template ----
echo "[1/2] Creating template 'order-delay' ..."

TEMPLATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${TEMPLATE_HOST}/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "order-delay",
    "name": "Order Delay Notification",
    "description": "Template for notifying customers about order delays. Channels: email, whatsapp.",
    "createdBy": "seed-script",
    "channels": [
      {
        "channel": "whatsapp",
        "body": "Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada."
      },
      {
        "channel": "email",
        "subject": "Aviso de retraso en su orden {{orderId}}",
        "body": "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Aviso de retraso en su orden</title>\n</head>\n<body style=\"margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;\">\n  <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f4f4f4;\">\n    <tr>\n      <td align=\"center\" style=\"padding:20px 0;\">\n        <table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#ffffff; border-radius:8px; overflow:hidden;\">\n          <!-- Header -->\n          <tr>\n            <td style=\"background-color:#d9534f; padding:24px 32px; text-align:center;\">\n              <h1 style=\"margin:0; color:#ffffff; font-size:22px;\">Aviso de retraso en su orden</h1>\n            </td>\n          </tr>\n          <!-- Body -->\n          <tr>\n            <td style=\"padding:32px;\">\n              <p style=\"margin:0 0 16px; font-size:16px; color:#333333;\">\n                Hola <strong>{{customerName}}</strong>,\n              </p>\n              <p style=\"margin:0 0 16px; font-size:15px; color:#555555;\">\n                Lamentamos informarle que su orden <strong>{{orderId}}</strong> se encuentra retrasada.\n              </p>\n              <p style=\"margin:0 0 24px; font-size:15px; color:#555555;\">\n                {{message}}\n              </p>\n\n              <!-- Items table -->\n              {{#each items}}\n              {{#if @first}}\n              <table role=\"presentation\" width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse; margin-bottom:24px;\">\n                <tr style=\"background-color:#f0f0f0;\">\n                  <th style=\"text-align:left; font-size:14px; color:#333333; border-bottom:2px solid #dddddd;\">Producto</th>\n                  <th style=\"text-align:center; font-size:14px; color:#333333; border-bottom:2px solid #dddddd;\">Cantidad</th>\n                </tr>\n              {{/if}}\n                <tr>\n                  <td style=\"font-size:14px; color:#555555; border-bottom:1px solid #eeeeee;\">{{this.name}}</td>\n                  <td style=\"font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:center;\">{{this.quantity}}</td>\n                </tr>\n              {{#if @last}}\n              </table>\n              {{/if}}\n              {{/each}}\n\n              <p style=\"margin:0 0 8px; font-size:15px; color:#555555;\">\n                <strong>Fecha estimada de entrega:</strong> {{promiseDate}}\n              </p>\n\n              {{#if trackingURL}}\n              <p style=\"margin:0 0 24px; font-size:15px; color:#555555;\">\n                <strong>Rastreo:</strong>\n                <a href=\"{{trackingURL}}\" style=\"color:#337ab7; text-decoration:none;\">{{trackingNumber}}</a>\n              </p>\n              {{/if}}\n\n              <p style=\"margin:0; font-size:14px; color:#999999;\">\n                Agradecemos su paciencia y comprension.\n              </p>\n            </td>\n          </tr>\n          <!-- Footer -->\n          <tr>\n            <td style=\"background-color:#f9f9f9; padding:16px 32px; text-align:center; font-size:12px; color:#999999;\">\n              Este es un mensaje automatico, por favor no responda a este correo.\n            </td>\n          </tr>\n        </table>\n      </td>\n    </tr>\n  </table>\n</body>\n</html>"
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
echo "[2/2] Creating notification rule 'Order Delay — Email + WhatsApp' ..."

RULE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${ENGINE_HOST}/rules" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Order Delay — Email + WhatsApp\",
    \"eventType\": \"order.delay\",
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
echo "  curl http://${TEMPLATE_HOST}/templates/${TEMPLATE_ID}"
echo "  curl http://${ENGINE_HOST}/rules/${RULE_ID}"
