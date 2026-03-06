# Guia Event Mapping

## Objetivo

El **Event Mapping** es el mecanismo central que permite integrar cualquier sistema de origen (OMS, ERP, procesador de pagos, etc.) a la plataforma de notificaciones **sin necesidad de cambios en el codigo**. Cada sistema externo envia eventos con estructuras y nombres de campos diferentes; el Event Mapping define, mediante configuracion en tiempo de ejecucion, como transformar esos datos a un formato canonico unificado que el resto de la plataforma entiende.

**En resumen:** un Event Mapping es una receta que le dice al sistema "cuando llegue un evento del sistema X de tipo Y, toma estos campos, transformalos asi, y producelos en este formato estandar".

---

## Campos del Event Mapping

### Seccion General

| Campo | Obligatorio | Descripcion |
|-------|:-----------:|-------------|
| **Name** | Si | Nombre descriptivo del mapping (ej. "OMS - Pedido Enviado"). Sirve para identificarlo en la lista. |
| **Source ID** | Si | Identificador del sistema de origen (ej. `oms`, `erp`, `payment-gateway`). Maximo 50 caracteres. No se puede cambiar despues de creado. |
| **Event Type** | Si | Tipo de evento canonico en notacion de punto (ej. `order.shipped`, `payment.confirmed`). Maximo 100 caracteres. No se puede cambiar despues de creado. |
| **Description** | No | Texto libre para documentar el proposito del mapping. |
| **Priority** | No | Prioridad del evento: `normal` (por defecto) o `critical`. Afecta como se procesan los eventos aguas abajo (ver seccion de Prioridad). |
| **Active** | No | Interruptor on/off. Solo puede existir **un mapping activo** por combinacion de Source ID + Event Type. Al desactivar un mapping, los eventos de ese tipo dejan de procesarse. |

### Seccion Opciones Avanzadas

| Campo | Obligatorio | Descripcion |
|-------|:-----------:|-------------|
| **Timestamp Field** | No | Ruta con notacion de punto al campo de fecha/hora dentro del payload del origen (ej. `data.createdAt`, `order.timestamp`). Si no se configura, se usa la hora del servidor al recibir el evento. |
| **Timestamp Format** | No | Formato del timestamp del origen. Valores comunes: `iso8601` (por defecto), `epoch_ms` (milisegundos desde epoch), `epoch_s` (segundos desde epoch), o un formato personalizado de dayjs. |
| **Source Event ID Field** | No | Ruta al identificador unico del evento en el payload del origen (ej. `data.eventId`). Se usa para **deduplicacion**: si llega un evento con el mismo Source ID + Source Event ID dentro de una ventana de 24 horas, se descarta como duplicado. |

### Seccion Field Mappings (Mapeo de Campos)

Esta es la seccion mas importante. Aqui se define como extraer y transformar cada campo del payload de origen hacia el formato canonico. Cada fila representa un campo canonico y tiene las siguientes columnas:

| Columna | Obligatorio | Descripcion |
|---------|:-----------:|-------------|
| **Source Path** | Si* | Ruta con notacion de punto al valor en el payload de origen (ej. `customer.id`, `order.items[0].sku`). Para transforms que usan multiples campos (como `concatenate`), se pueden especificar multiples rutas. *No aplica para el transform `static`. |
| **Target Field** | Si | Nombre del campo canonico de destino (ej. `customerId`, `orderId`). Este es el nombre que usaran los servicios aguas abajo. |
| **Transform** | No | Tipo de transformacion a aplicar. Por defecto: `direct` (copiar tal cual). Ver tabla de transformaciones abajo. |
| **Required** | No | Si se marca como requerido y el campo resulta vacio o nulo despues de aplicar el default y la transformacion, **el evento entero se rechaza**. |
| **Default Value** | No | Valor de respaldo que se usa cuando el campo de origen es nulo, indefinido o no existe. Se aplica **antes** de la transformacion. |

**Se requiere al menos un field mapping por Event Mapping.**

---

## Transformaciones Disponibles

Las transformaciones definen como se procesa el valor extraido del origen antes de asignarlo al campo canonico.

| Transform | Que hace | Opciones | Ejemplo |
|-----------|----------|----------|---------|
| `direct` | Copia el valor tal cual, sin modificacion | — | `"ABC-123"` → `"ABC-123"` |
| `toString` | Convierte el valor a texto | — | `12345` → `"12345"` |
| `toNumber` | Convierte el valor a numero | — | `"99.50"` → `99.5` |
| `concatenate` | Une multiples campos en un solo texto | `separator`: separador entre valores | `"Juan"` + `"Perez"` → `"Juan Perez"` |
| `prefix` | Agrega un texto al inicio | `prefix`: texto a anteponer | `"12345"` con prefix `"ORD-"` → `"ORD-12345"` |
| `suffix` | Agrega un texto al final | `suffix`: texto a agregar | `"12345"` con suffix `"-MX"` → `"12345-MX"` |
| `template` | Genera texto usando plantilla Handlebars | `template`: plantilla con `{{campo}}` | Template `"{{first}} {{last}}"` → `"Juan Perez"` |
| `map` | Busca en una tabla de equivalencias | `mappings`: objeto clave-valor | `"A"` con mappings `{"A":"Apple"}` → `"Apple"` |
| `dateFormat` | Cambia el formato de una fecha | `inputFormat`, `outputFormat` | `"2026-03-04"` → `"04/03/2026"` |
| `epochToIso` | Convierte epoch a fecha ISO-8601 | `unit`: `"ms"` o `"s"` | `1709553600000` → `"2024-03-04T12:00:00.000Z"` |
| `arrayMap` | Transforma cada elemento de un array | `fieldRenames`: objeto de renombrado | `[{qty:1}]` → `[{quantity:1}]` |
| `jsonPath` | Extrae un valor usando expresion JSONPath | `expression`: expresion JSONPath | `"$.items[*].price"` extrae todos los precios |
| `static` | Asigna un valor fijo (no depende del origen) | `value`: valor a asignar | Siempre produce `"v2.0"` |

---

## Prioridad: Normal vs Critical

La prioridad determina como se enrutan los eventos normalizados hacia los servicios aguas abajo:

- **`normal`** (por defecto): El evento se publica con routing key `event.normal.{eventType}` y se procesa en las colas estandar.
- **`critical`**: El evento se publica con routing key `event.critical.{eventType}` y se procesa en colas de alta prioridad, lo que significa tiempos de entrega mas rapidos y procesamiento preferente.

**Cuando usar `critical`:** Para eventos que requieren notificacion inmediata, como confirmaciones de pago, alertas de fraude, o cambios criticos de estado.

---

## Funcionalidad de Prueba (Test)

Cada Event Mapping tiene un panel de prueba integrado que permite verificar la configuracion **sin enviar eventos reales**:

1. Se introduce un JSON de ejemplo que simula el payload del sistema de origen.
2. Se ejecuta la prueba ("Run Test").
3. El sistema aplica el mapping completo (extraccion, transformaciones, valores por defecto) y muestra:
   - **Evento canonico resultante**: El JSON normalizado tal como lo verian los servicios aguas abajo.
   - **Warnings**: Advertencias sobre transforms desconocidos o campos que no se pudieron extraer (pero no eran requeridos).
   - **Missing Required Fields**: Lista de campos marcados como `required` que quedaron vacios — esto indica que el mapping necesita ajustes.

---

## Event Type Mapping (Mapeo de Tipo de Evento)

Configuracion avanzada (a nivel de JSON) que permite que un mismo mapping maneje multiples tipos de evento del origen y los traduzca a tipos canonicos. Ejemplo:

```json
{
  "ORDER_SHIPPED": "order.shipped",
  "ORDER_CREATED": "order.created",
  "PEDIDO_CANCELADO": "order.cancelled"
}
```

Si el tipo de evento del origen no esta en la tabla, se usa tal cual (passthrough).

---

## Validation Schema (Esquema de Validacion)

Configuracion avanzada (a nivel de JSON) que define un JSON Schema (draft-07) para validar el payload del origen **antes** de aplicar el mapping. Si el payload no cumple el esquema, el evento se rechaza con error `EIS-005`.

Ejemplo:
```json
{
  "type": "object",
  "required": ["customer", "order"],
  "properties": {
    "customer": { "type": "object" },
    "order": { "type": "object" }
  }
}
```

---

## Ejemplos Practicos

### Ejemplo 1: OMS - Pedido Enviado

**Contexto:** El sistema OMS envia un evento cuando un pedido se envia. Queremos extraer los datos relevantes para notificar al cliente.

**Configuracion del Mapping:**

| Campo | Valor |
|-------|-------|
| Name | OMS - Pedido Enviado |
| Source ID | `oms` |
| Event Type | `order.shipped` |
| Priority | normal |
| Timestamp Field | `data.shippedAt` |
| Timestamp Format | `iso8601` |
| Source Event ID Field | `data.eventId` |

**Field Mappings:**

| Source Path | Target Field | Transform | Required | Default |
|-------------|-------------|-----------|:--------:|---------|
| `data.customerId` | customerId | direct | Si | — |
| `data.orderNumber` | orderId | prefix | Si | — |
| `data.customer.firstName` | customerFirstName | direct | Si | — |
| `data.customer.lastName` | customerLastName | direct | No | — |
| `data.customer.email` | customerEmail | direct | Si | — |
| `data.trackingNumber` | trackingNumber | direct | No | — |
| `data.carrier` | carrier | direct | No | `"Correos de Mexico"` |
| `data.items` | orderItems | arrayMap | No | — |

**Opciones de transforms:**
- `orderId` usa prefix con opcion `{ "prefix": "OMS-" }` → convierte `"12345"` en `"OMS-12345"`.
- `orderItems` usa arrayMap con opcion `{ "fieldRenames": { "qty": "quantity", "unit_price": "unitPrice" } }`.

**Payload de origen (ejemplo):**
```json
{
  "data": {
    "eventId": "evt-001",
    "shippedAt": "2026-03-04T10:30:00Z",
    "customerId": "CUST-789",
    "orderNumber": "12345",
    "customer": {
      "firstName": "Maria",
      "lastName": "Garcia",
      "email": "maria@example.com"
    },
    "trackingNumber": "TRK-999",
    "carrier": "DHL",
    "items": [
      { "sku": "PROD-A", "qty": 2, "unit_price": 150.00 },
      { "sku": "PROD-B", "qty": 1, "unit_price": 300.00 }
    ]
  }
}
```

**Evento canonico resultante:**
```json
{
  "customerId": "CUST-789",
  "orderId": "OMS-12345",
  "customerFirstName": "Maria",
  "customerLastName": "Garcia",
  "customerEmail": "maria@example.com",
  "trackingNumber": "TRK-999",
  "carrier": "DHL",
  "orderItems": [
    { "sku": "PROD-A", "quantity": 2, "unitPrice": 150.00 },
    { "sku": "PROD-B", "quantity": 1, "unitPrice": 300.00 }
  ],
  "metadata": {
    "eventType": "order.shipped",
    "timestamp": "2026-03-04T10:30:00Z",
    "schemaVersion": "2.0",
    "priority": "normal",
    "sourceEventId": "evt-001"
  }
}
```

---

### Ejemplo 2: ERP - Pago Confirmado (Critico)

**Contexto:** El ERP envia confirmaciones de pago. Como es critico para la experiencia del cliente, se configura con prioridad `critical`. El ERP usa nombres de campos en espanol y formatos diferentes.

**Configuracion del Mapping:**

| Campo | Valor |
|-------|-------|
| Name | ERP - Pago Confirmado |
| Source ID | `erp` |
| Event Type | `payment.confirmed` |
| Priority | critical |
| Timestamp Field | `fecha_pago` |
| Timestamp Format | `epoch_ms` |

**Field Mappings:**

| Source Path | Target Field | Transform | Required | Default |
|-------------|-------------|-----------|:--------:|---------|
| `cliente_id` | customerId | direct | Si | — |
| `numero_pedido` | orderId | prefix | Si | — |
| `monto` | paymentAmount | toNumber | Si | — |
| `moneda` | currency | map | No | — |
| `metodo_pago` | paymentMethod | direct | No | `"unknown"` |
| — | source | static | No | — |

**Opciones de transforms:**
- `orderId` usa prefix con opcion `{ "prefix": "ERP-" }`.
- `currency` usa map con opcion `{ "mappings": { "MXN": "MXN", "DOL": "USD", "EUR": "EUR" } }` → traduce codigos internos del ERP a codigos ISO estandar.
- `source` usa static con opcion `{ "value": "erp-pagos" }` → siempre asigna el valor fijo `"erp-pagos"`.

**Payload de origen (ejemplo):**
```json
{
  "cliente_id": "C-456",
  "numero_pedido": "98765",
  "monto": "1500.50",
  "moneda": "DOL",
  "metodo_pago": "tarjeta_credito",
  "fecha_pago": 1709553600000
}
```

**Evento canonico resultante:**
```json
{
  "customerId": "C-456",
  "orderId": "ERP-98765",
  "paymentAmount": 1500.50,
  "currency": "USD",
  "paymentMethod": "tarjeta_credito",
  "source": "erp-pagos",
  "metadata": {
    "eventType": "payment.confirmed",
    "timestamp": "2024-03-04T12:00:00.000Z",
    "schemaVersion": "2.0",
    "priority": "critical"
  }
}
```

Notar como:
- `"1500.50"` (texto) se convirtio a `1500.50` (numero) con `toNumber`.
- `"DOL"` se tradujo a `"USD"` con `map`.
- Se agrego el campo `source` con valor fijo `"erp-pagos"` usando `static`.
- El timestamp epoch se convirtio a ISO-8601.

---

### Ejemplo 3: Plataforma Web - Registro de Usuario

**Contexto:** La plataforma web envia un evento cuando un usuario se registra. Se quiere combinar nombre y apellido en un solo campo y asignar una version fija.

**Field Mappings:**

| Source Path | Target Field | Transform | Required | Default |
|-------------|-------------|-----------|:--------:|---------|
| `user.id` | userId | direct | Si | — |
| `user.email` | email | direct | Si | — |
| `user.firstName`, `user.lastName` | fullName | concatenate | No | — |
| `user.phone` | phone | direct | No | `"N/A"` |
| — | schemaVersion | static | No | — |

**Opciones de transforms:**
- `fullName` usa concatenate con opcion `{ "separator": " " }`.
- `schemaVersion` usa static con opcion `{ "value": "1.0" }`.

---

## Consideraciones Importantes

### Restriccion de Unicidad
Solo puede existir **un mapping activo** por combinacion de Source ID + Event Type. Si se necesita cambiar el mapping para una combinacion existente, se debe desactivar el anterior o editarlo directamente. Intentar crear un segundo mapping activo con la misma combinacion produce el error `EIS-009`.

### Campos Inmutables
Una vez creado un mapping, los campos **Source ID** y **Event Type** no se pueden modificar. Si se necesitan valores diferentes, se debe crear un mapping nuevo y desactivar el anterior.

### Versionamiento
Cada vez que se edita un mapping, el sistema incrementa automaticamente su numero de version. Esto permite rastrear el historial de cambios.

### Deduplicacion
Si se configura el campo **Source Event ID Field**, el sistema descarta automaticamente eventos duplicados que lleguen dentro de una ventana de 24 horas. Esto es crucial para sistemas de origen que pueden reintentar envios.

### Campos Requeridos vs Opcionales
Marcar un campo como **Required** significa que si el valor no se puede extraer ni hay un valor por defecto, **el evento completo se rechaza**. Usar con cuidado — solo marcar como requerido los campos que son verdaderamente indispensables para el procesamiento aguas abajo.

### Valor por Defecto
El valor por defecto se aplica **antes** de la transformacion. Esto significa que si un campo de origen es nulo y tiene un default de `"0"` con transform `toNumber`, el resultado sera el numero `0`.

### Probar Siempre Antes de Activar
Se recomienda fuertemente utilizar la funcionalidad de **Test** con payloads reales del sistema de origen antes de activar un mapping en produccion. Esto permite detectar problemas de configuracion sin afectar el flujo real de eventos.

### Notacion de Punto para Rutas
Los campos Source Path y Timestamp Field usan notacion de punto para acceder a campos anidados:
- `data.customer.email` → accede a `{ data: { customer: { email: "..." } } }`
- `items[0].sku` → accede al primer elemento del array items

### Invalidacion de Cache
Si el sistema tiene el cache de mappings habilitado, los cambios en mappings se propagan automaticamente via RabbitMQ. No se requiere reiniciar ningun servicio.
