#!/usr/bin/env bash
# =============================================================================
# End-to-End: WhatsApp Template Message Pipeline via Bulk Upload
# =============================================================================
# Builds, starts, seeds, and triggers the full notification pipeline:
#
#   test-order-delay.xlsx
#     -> bulk-upload-service (:3158)
#       -> event-ingestion-service (:3151)
#         -> [RabbitMQ] -> notification-engine-service (:3152)
#           -> template-service (:3153) [HTTP render]
#           -> [RabbitMQ] -> channel-router-service (:3154)
#             -> [HTTP POST /send] -> adapter-whatsapp (:3173)
#               -> Meta Graph API (type: "template")
#
# Prerequisites:
#   - PostgreSQL running on localhost:5433 (all schemas created)
#   - RabbitMQ running on localhost:5672 (definitions imported)
#   - Node.js, npm, curl, jq installed
#   - All services have node_modules installed (npm install)
#   - .env files configured in each service folder
#
# Usage:
#   bash scripts/run-e2e-whatsapp-pipeline.sh
#   bash scripts/run-e2e-whatsapp-pipeline.sh --skip-build
#   bash scripts/run-e2e-whatsapp-pipeline.sh --skip-build --skip-seed
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGS_DIR="${ROOT_DIR}/scripts/logs"

# Service ports
EIS_PORT=3151
NES_PORT=3152
TS_PORT=3153
CRS_PORT=3154
BUS_PORT=3158
WA_PORT=3173

# Hosts
EIS_HOST="localhost:${EIS_PORT}"
NES_HOST="localhost:${NES_PORT}"
TS_HOST="localhost:${TS_PORT}"
CRS_HOST="localhost:${CRS_PORT}"
BUS_HOST="localhost:${BUS_PORT}"
WA_HOST="localhost:${WA_PORT}"

# Infra
PG_HOST="localhost"
PG_PORT=5433
RMQ_HOST="localhost"
RMQ_PORT=5672
RMQ_MGMT_PORT=15672

# XLSX file
XLSX_FILE="${ROOT_DIR}/bulk-upload-service/docs/test-order-delay.xlsx"

# Timeouts
HEALTH_TIMEOUT=90           # seconds to wait for each service health check
HEALTH_INTERVAL=3           # seconds between health check attempts
UPLOAD_POLL_TIMEOUT=120     # seconds to wait for upload completion
UPLOAD_POLL_INTERVAL=3      # seconds between upload status polls

# Flags
SKIP_BUILD=false
SKIP_SEED=false
SKIP_START=false

# PID tracking
declare -a SERVICE_PIDS=()

# ─── Parse CLI args ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)  SKIP_BUILD=true; shift ;;
    --skip-seed)   SKIP_SEED=true; shift ;;
    --skip-start)  SKIP_START=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--skip-build] [--skip-seed] [--skip-start]"
      echo ""
      echo "Flags:"
      echo "  --skip-build  Skip npm run build for all services"
      echo "  --skip-seed   Skip template/rule creation and provider registration"
      echo "  --skip-start  Skip service startup (assumes services are already running)"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { echo "[$(date +%H:%M:%S)] OK  $*"; }
fail() { echo "[$(date +%H:%M:%S)] FAIL $*" >&2; }
die()  { fail "$@"; cleanup; exit 1; }

cleanup() {
  log "Cleaning up background processes..."
  for pid in "${SERVICE_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  log "Cleanup complete."
}

trap cleanup EXIT INT TERM

wait_for_port() {
  local host="$1" port="$2" name="$3" timeout="${4:-$HEALTH_TIMEOUT}"
  local elapsed=0

  while ! curl -sf "http://${host}:${port}/health" > /dev/null 2>&1; do
    if [[ $elapsed -ge $timeout ]]; then
      die "${name} did not become healthy within ${timeout}s"
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
  done

  ok "${name} healthy (${elapsed}s)"
}

check_port_free() {
  local port="$1" name="$2"
  if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
    log "  ${name} (:${port}) already running"
    return 1
  fi
  return 0
}

start_service() {
  local name="$1" dir="$2" cmd="$3" logfile="$4"

  log "  Starting ${name}..."
  cd "${dir}"
  nohup bash -c "${cmd}" > "${logfile}" 2>&1 &
  local pid=$!
  SERVICE_PIDS+=("$pid")
  log "  ${name} started (PID ${pid}, log: ${logfile})"
  cd "${ROOT_DIR}"
}

# ─── Banner ──────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  WhatsApp Template Pipeline — End-to-End"
echo "============================================================"
echo ""
log "Root directory : ${ROOT_DIR}"
log "XLSX file      : ${XLSX_FILE}"
log "Skip build     : ${SKIP_BUILD}"
log "Skip seed      : ${SKIP_SEED}"
log "Skip start     : ${SKIP_START}"
echo ""

# ─── Step 0: Prerequisites ───────────────────────────────────────────────────

log "=== Step 0: Checking prerequisites ==="

# Check tools
for tool in curl jq node npm; do
  if ! command -v "$tool" &>/dev/null; then
    die "Required tool not found: ${tool}"
  fi
done
ok "Required tools available (curl, jq, node, npm)"

# Check XLSX file
if [[ ! -f "$XLSX_FILE" ]]; then
  die "XLSX file not found: ${XLSX_FILE}"
fi
ok "XLSX file exists: $(basename "$XLSX_FILE")"

# Check PostgreSQL
if curl -sf "http://localhost:${RMQ_MGMT_PORT}/api/overview" > /dev/null 2>&1 || \
   timeout 3 bash -c "echo > /dev/tcp/${PG_HOST}/${PG_PORT}" 2>/dev/null; then
  ok "PostgreSQL reachable on :${PG_PORT}"
else
  log "  WARNING: Cannot verify PostgreSQL on :${PG_PORT} (may still be accessible)"
fi

# Check RabbitMQ
if curl -sf -u notificationapi:notificationapi "http://${RMQ_HOST}:${RMQ_MGMT_PORT}/api/overview" > /dev/null 2>&1; then
  ok "RabbitMQ Management reachable on :${RMQ_MGMT_PORT}"
else
  log "  WARNING: Cannot verify RabbitMQ Management on :${RMQ_MGMT_PORT}"
fi

# Create logs directory
mkdir -p "${LOGS_DIR}"

echo ""

# ─── Step 1: Build services ─────────────────────────────────────────────────

if [[ "$SKIP_BUILD" == "true" ]]; then
  log "=== Step 1: Build (SKIPPED) ==="
else
  log "=== Step 1: Building services ==="

  declare -A BUILD_DIRS=(
    ["event-ingestion-service"]="${ROOT_DIR}/event-ingestion-service"
    ["notification-engine-service"]="${ROOT_DIR}/notification-engine-service"
    ["template-service"]="${ROOT_DIR}/template-service"
    ["channel-router-service"]="${ROOT_DIR}/channel-router-service"
    ["bulk-upload-service"]="${ROOT_DIR}/bulk-upload-service"
    ["provider-adapters"]="${ROOT_DIR}/provider-adapters"
  )

  for name in event-ingestion-service notification-engine-service template-service channel-router-service bulk-upload-service; do
    log "  Building ${name}..."
    cd "${BUILD_DIRS[$name]}"
    npm run build > "${LOGS_DIR}/build-${name}.log" 2>&1 || die "Build failed for ${name} — see ${LOGS_DIR}/build-${name}.log"
    ok "  ${name} built"
    cd "${ROOT_DIR}"
  done

  # Build WhatsApp adapter specifically
  log "  Building adapter-whatsapp..."
  cd "${BUILD_DIRS[provider-adapters]}"
  npm run build:whatsapp > "${LOGS_DIR}/build-adapter-whatsapp.log" 2>&1 || die "Build failed for adapter-whatsapp — see ${LOGS_DIR}/build-adapter-whatsapp.log"
  ok "  adapter-whatsapp built"
  cd "${ROOT_DIR}"

  ok "All services built"
fi

echo ""

# ─── Step 2: Start services ─────────────────────────────────────────────────

if [[ "$SKIP_START" == "true" ]]; then
  log "=== Step 2: Start services (SKIPPED — assuming already running) ==="
else
  log "=== Step 2: Starting services ==="

  # Start each service if not already running
  if check_port_free $EIS_PORT "event-ingestion-service"; then
    start_service "event-ingestion-service" \
      "${ROOT_DIR}/event-ingestion-service" \
      "node dist/main" \
      "${LOGS_DIR}/run-eis.log"
  fi

  if check_port_free $TS_PORT "template-service"; then
    start_service "template-service" \
      "${ROOT_DIR}/template-service" \
      "node dist/main" \
      "${LOGS_DIR}/run-ts.log"
  fi

  if check_port_free $NES_PORT "notification-engine-service"; then
    start_service "notification-engine-service" \
      "${ROOT_DIR}/notification-engine-service" \
      "node dist/main" \
      "${LOGS_DIR}/run-nes.log"
  fi

  if check_port_free $CRS_PORT "channel-router-service"; then
    start_service "channel-router-service" \
      "${ROOT_DIR}/channel-router-service" \
      "node dist/main" \
      "${LOGS_DIR}/run-crs.log"
  fi

  if check_port_free $BUS_PORT "bulk-upload-service"; then
    start_service "bulk-upload-service" \
      "${ROOT_DIR}/bulk-upload-service" \
      "node dist/main" \
      "${LOGS_DIR}/run-bus.log"
  fi

  if check_port_free $WA_PORT "adapter-whatsapp"; then
    start_service "adapter-whatsapp" \
      "${ROOT_DIR}/provider-adapters" \
      "node dist/apps/adapter-whatsapp/main" \
      "${LOGS_DIR}/run-wa.log"
  fi

  log "Waiting for services to become healthy..."

  wait_for_port localhost $EIS_PORT "event-ingestion-service"
  wait_for_port localhost $TS_PORT  "template-service"
  wait_for_port localhost $NES_PORT "notification-engine-service"
  wait_for_port localhost $CRS_PORT "channel-router-service"
  wait_for_port localhost $BUS_PORT "bulk-upload-service"
  wait_for_port localhost $WA_PORT  "adapter-whatsapp"

  ok "All services healthy"
fi

echo ""

# ─── Step 3: Seed data ──────────────────────────────────────────────────────

if [[ "$SKIP_SEED" == "true" ]]; then
  log "=== Step 3: Seed data (SKIPPED) ==="
else
  log "=== Step 3: Seeding data ==="

  # ---- 3a: Create template WITH channelMetadata for WhatsApp ----
  log "  [3a] Creating template 'order-delay' (with WhatsApp channelMetadata)..."

  TEMPLATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${TS_HOST}/templates" \
    -H "Content-Type: application/json" \
    -d '{
      "slug": "order-delay",
      "name": "Order Delay Notification",
      "description": "Template for notifying customers about order delays. Channels: email, whatsapp.",
      "createdBy": "e2e-script",
      "channels": [
        {
          "channel": "whatsapp",
          "body": "Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada.",
          "metadata": {
            "metaTemplateName": "order_delay",
            "metaTemplateLanguage": "es_MX",
            "metaTemplateParameters": ["customerName", "orderId"]
          }
        },
        {
          "channel": "email",
          "subject": "Aviso de retraso en su orden {{orderId}}",
          "body": "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"UTF-8\"><title>Aviso de retraso</title></head><body style=\"margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#f4f4f4;\"><tr><td align=\"center\" style=\"padding:20px 0;\"><table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#fff;border-radius:8px;\"><tr><td style=\"background-color:#d9534f;padding:24px 32px;text-align:center;\"><h1 style=\"margin:0;color:#fff;font-size:22px;\">Aviso de retraso en su orden</h1></td></tr><tr><td style=\"padding:32px;\"><p style=\"margin:0 0 16px;font-size:16px;color:#333;\">Hola <strong>{{customerName}}</strong>,</p><p style=\"margin:0 0 16px;font-size:15px;color:#555;\">Lamentamos informarle que su orden <strong>{{orderId}}</strong> se encuentra retrasada.</p><p style=\"margin:0 0 24px;font-size:15px;color:#555;\">{{message}}</p>{{#each items}}{{#if @first}}<table role=\"presentation\" width=\"100%\" cellpadding=\"8\" cellspacing=\"0\" style=\"border-collapse:collapse;margin-bottom:24px;\"><tr style=\"background-color:#f0f0f0;\"><th style=\"text-align:left;font-size:14px;border-bottom:2px solid #ddd;\">Producto</th><th style=\"text-align:center;font-size:14px;border-bottom:2px solid #ddd;\">Cantidad</th></tr>{{/if}}<tr><td style=\"font-size:14px;color:#555;border-bottom:1px solid #eee;\">{{this.name}}</td><td style=\"font-size:14px;color:#555;border-bottom:1px solid #eee;text-align:center;\">{{this.quantity}}</td></tr>{{#if @last}}</table>{{/if}}{{/each}}<p style=\"margin:0 0 8px;font-size:15px;color:#555;\"><strong>Fecha estimada:</strong> {{promiseDate}}</p>{{#if trackingURL}}<p style=\"margin:0 0 24px;font-size:15px;color:#555;\"><strong>Rastreo:</strong> <a href=\"{{trackingURL}}\" style=\"color:#337ab7;\">{{trackingNumber}}</a></p>{{/if}}<p style=\"margin:0;font-size:14px;color:#999;\">Agradecemos su paciencia.</p></td></tr><tr><td style=\"background-color:#f9f9f9;padding:16px 32px;text-align:center;font-size:12px;color:#999;\">Mensaje automatico, no responda.</td></tr></table></td></tr></table></body></html>"
        }
      ]
    }')

  HTTP_CODE=$(echo "$TEMPLATE_RESPONSE" | tail -n1)
  TEMPLATE_BODY=$(echo "$TEMPLATE_RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" == "201" ]]; then
    TEMPLATE_ID=$(echo "$TEMPLATE_BODY" | jq -r '.id')
    ok "  Template created: ${TEMPLATE_ID}"
  elif [[ "$HTTP_CODE" == "409" ]]; then
    # Template already exists — fetch it by slug
    log "  Template 'order-delay' already exists (409), fetching..."
    TEMPLATES_LIST=$(curl -s "http://${TS_HOST}/templates?search=order-delay")
    TEMPLATE_ID=$(echo "$TEMPLATES_LIST" | jq -r '.data[0].id // .items[0].id // .[0].id // empty')
    if [[ -z "$TEMPLATE_ID" || "$TEMPLATE_ID" == "null" ]]; then
      die "Could not find existing order-delay template"
    fi
    ok "  Existing template found: ${TEMPLATE_ID}"
  else
    fail "  Template creation failed (HTTP ${HTTP_CODE}):"
    echo "$TEMPLATE_BODY" | jq . 2>/dev/null || echo "$TEMPLATE_BODY"
    die "Template seed failed"
  fi

  # ---- 3b: Create notification rule ----
  log "  [3b] Creating notification rule 'Order Delay — Email + WhatsApp'..."

  RULE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${NES_HOST}/rules" \
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
      \"createdBy\": \"e2e-script\"
    }")

  HTTP_CODE=$(echo "$RULE_RESPONSE" | tail -n1)
  RULE_BODY=$(echo "$RULE_RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" == "201" ]]; then
    RULE_ID=$(echo "$RULE_BODY" | jq -r '.id')
    ok "  Rule created: ${RULE_ID}"
  elif [[ "$HTTP_CODE" == "409" ]]; then
    log "  Rule already exists (409), continuing..."
    RULE_ID="(existing)"
    ok "  Using existing rule"
  else
    fail "  Rule creation failed (HTTP ${HTTP_CODE}):"
    echo "$RULE_BODY" | jq . 2>/dev/null || echo "$RULE_BODY"
    die "Rule seed failed"
  fi

  # ---- 3c: Register WhatsApp adapter with channel-router ----
  log "  [3c] Registering WhatsApp adapter with channel-router..."

  REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${CRS_HOST}/providers/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"providerName\": \"Meta WhatsApp\",
      \"providerId\": \"meta-whatsapp\",
      \"channel\": \"whatsapp\",
      \"adapterUrl\": \"http://localhost:${WA_PORT}\",
      \"isActive\": true,
      \"routingWeight\": 100
    }")

  HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
  REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" == "201" ]]; then
    ok "  WhatsApp adapter registered"
  elif [[ "$HTTP_CODE" == "409" ]]; then
    log "  WhatsApp adapter already registered (409), continuing..."
    ok "  Using existing adapter registration"
  else
    fail "  Provider registration failed (HTTP ${HTTP_CODE}):"
    echo "$REGISTER_BODY" | jq . 2>/dev/null || echo "$REGISTER_BODY"
    die "Provider registration failed"
  fi

  # ---- 3d: Register Mailgun adapter for email channel ----
  log "  [3d] Registering Mailgun adapter for email channel..."

  MAILGUN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${CRS_HOST}/providers/register" \
    -H "Content-Type: application/json" \
    -d '{
      "providerName": "Mailgun",
      "providerId": "mailgun-primary",
      "channel": "email",
      "adapterUrl": "http://localhost:3171",
      "isActive": true,
      "routingWeight": 100
    }')

  HTTP_CODE=$(echo "$MAILGUN_RESPONSE" | tail -n1)

  if [[ "$HTTP_CODE" == "201" ]]; then
    ok "  Mailgun adapter registered"
  elif [[ "$HTTP_CODE" == "409" ]]; then
    ok "  Mailgun adapter already registered"
  else
    log "  Mailgun registration returned HTTP ${HTTP_CODE} (non-critical, email may not work)"
  fi

  ok "Seed complete"
fi

echo ""

# ─── Step 4: Upload XLSX via Bulk Upload Service ─────────────────────────────

log "=== Step 4: Uploading test-order-delay.xlsx ==="

UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://${BUS_HOST}/uploads" \
  -F "file=@${XLSX_FILE}")

HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "202" ]]; then
  fail "Upload failed (HTTP ${HTTP_CODE}):"
  echo "$UPLOAD_BODY" | jq . 2>/dev/null || echo "$UPLOAD_BODY"
  die "XLSX upload failed"
fi

UPLOAD_ID=$(echo "$UPLOAD_BODY" | jq -r '.id')

if [[ -z "$UPLOAD_ID" || "$UPLOAD_ID" == "null" ]]; then
  die "Could not extract upload ID from response"
fi

ok "Upload accepted: ${UPLOAD_ID}"
echo ""

# ─── Step 5: Poll for completion ─────────────────────────────────────────────

log "=== Step 5: Polling upload status ==="

ELAPSED=0
FINAL_STATUS=""

while [[ $ELAPSED -lt $UPLOAD_POLL_TIMEOUT ]]; do
  STATUS_RESPONSE=$(curl -s "http://${BUS_HOST}/uploads/${UPLOAD_ID}/status")
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status // "unknown"')
  PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.progress // "?"')
  TOTAL=$(echo "$STATUS_RESPONSE" | jq -r '.totalRows // .total // "?"')
  PROCESSED=$(echo "$STATUS_RESPONSE" | jq -r '.processedRows // .processed // "?"')

  log "  Status: ${STATUS} | Progress: ${PROGRESS}% | Processed: ${PROCESSED}/${TOTAL}"

  case "$STATUS" in
    completed|COMPLETED)
      FINAL_STATUS="completed"
      break
      ;;
    failed|FAILED)
      FINAL_STATUS="failed"
      break
      ;;
    cancelled|CANCELLED)
      FINAL_STATUS="cancelled"
      break
      ;;
    *)
      sleep "$UPLOAD_POLL_INTERVAL"
      ELAPSED=$((ELAPSED + UPLOAD_POLL_INTERVAL))
      ;;
  esac
done

echo ""

if [[ -z "$FINAL_STATUS" ]]; then
  die "Upload did not complete within ${UPLOAD_POLL_TIMEOUT}s (last status: ${STATUS})"
fi

# ─── Step 6: Show results ────────────────────────────────────────────────────

log "=== Step 6: Results ==="

# Get final upload details
UPLOAD_DETAILS=$(curl -s "http://${BUS_HOST}/uploads/${UPLOAD_ID}")
echo "$UPLOAD_DETAILS" | jq '{
  id: .id,
  status: .status,
  fileName: .fileName,
  totalRows: .totalRows,
  succeededRows: .succeededRows,
  failedRows: .failedRows,
  skippedRows: .skippedRows,
  totalEvents: .totalEvents,
  resultFileReady: .resultFileReady
}' 2>/dev/null || echo "$UPLOAD_DETAILS"

if [[ "$FINAL_STATUS" == "completed" ]]; then
  echo ""
  ok "Pipeline completed!"
  echo ""
  echo "  What happened:"
  echo "    1. XLSX uploaded and parsed (group mode: rows grouped by orderId)"
  echo "    2. Events submitted to event-ingestion-service"
  echo "    3. Notification-engine matched 'order.delay' rule"
  echo "    4. Template rendered via template-service (with WhatsApp channelMetadata)"
  echo "    5. Dispatch sent to channel-router with:"
  echo "         templateName: 'order_delay' (Meta template name, NOT internal UUID)"
  echo "         templateLanguage: 'es_MX'"
  echo "         templateParameters: resolved from payload fields"
  echo "    6. Channel-router forwarded to adapter-whatsapp (:${WA_PORT})"
  echo "    7. Adapter built Meta API payload: type='template' (NOT 'text')"
  echo ""
  echo "  Verify:"
  echo "    Upload details : curl http://${BUS_HOST}/uploads/${UPLOAD_ID}"
  echo "    Upload errors  : curl http://${BUS_HOST}/uploads/${UPLOAD_ID}/errors"
  echo "    Download result: curl -o result.xlsx http://${BUS_HOST}/uploads/${UPLOAD_ID}/result"
  echo "    Notifications  : curl http://${NES_HOST}/notifications"
  echo "    Adapter logs   : cat ${LOGS_DIR}/run-wa.log"
  echo ""

  # Check for errors
  FAILED_ROWS=$(echo "$UPLOAD_DETAILS" | jq -r '.failedRows // 0')
  if [[ "$FAILED_ROWS" -gt 0 ]]; then
    log "  WARNING: ${FAILED_ROWS} rows failed. Check errors:"
    curl -s "http://${BUS_HOST}/uploads/${UPLOAD_ID}/errors" | jq '.' 2>/dev/null
  fi
else
  echo ""
  fail "Upload finished with status: ${FINAL_STATUS}"
  echo ""
  log "Check errors:"
  curl -s "http://${BUS_HOST}/uploads/${UPLOAD_ID}/errors" | jq '.' 2>/dev/null
  echo ""
  log "Check service logs:"
  echo "  EIS: ${LOGS_DIR}/run-eis.log"
  echo "  NES: ${LOGS_DIR}/run-nes.log"
  echo "  TS:  ${LOGS_DIR}/run-ts.log"
  echo "  CRS: ${LOGS_DIR}/run-crs.log"
  echo "  BUS: ${LOGS_DIR}/run-bus.log"
  echo "  WA:  ${LOGS_DIR}/run-wa.log"
fi

echo ""
echo "============================================================"
echo "  Script finished. Services are still running in background."
echo "  Press Ctrl+C to stop all services, or run:"
echo "    kill ${SERVICE_PIDS[*]:-"(no PIDs — services were already running)"}"
echo "============================================================"
echo ""

# Keep script alive until user presses Ctrl+C (so cleanup trap fires)
if [[ ${#SERVICE_PIDS[@]} -gt 0 ]]; then
  log "Waiting... Press Ctrl+C to stop all services."
  wait
fi
