# Guia de Mapeo — WhatsApp Meta Cloud API

## Objetivo

Esta guia explica como el sistema NotificationAPI transforma los datos de entrada (eventos canonicos de los sistemas origen) en llamadas a la **Meta Cloud API** para enviar mensajes de WhatsApp. Esta dirigida al equipo de operaciones para que puedan configurar nuevos templates de Meta sin necesidad de cambios en el codigo.

---

## Tabla de Contenidos

1. [Flujo General del Mensaje](#1-flujo-general-del-mensaje)
2. [Estructura del Mensaje Canonico (Entrada)](#2-estructura-del-mensaje-canonico-entrada)
3. [Mapeo a la Meta Cloud API (Salida)](#3-mapeo-a-la-meta-cloud-api-salida)
4. [Tipos de Mensaje Soportados](#4-tipos-de-mensaje-soportados)
5. [Como Configurar un Nuevo Template de Meta](#5-como-configurar-un-nuevo-template-de-meta)
6. [Ejemplos Completos](#6-ejemplos-completos)
7. [Formato de Numeros de Telefono](#7-formato-de-numeros-de-telefono)
8. [Errores Comunes y Solucion](#8-errores-comunes-y-solucion)
9. [Modo de Pruebas (Test Mode)](#9-modo-de-pruebas-test-mode)
10. [Variables de Entorno](#10-variables-de-entorno)

---

## 1. Flujo General del Mensaje

El mensaje recorre los siguientes servicios antes de llegar a Meta:

```
Sistema Origen (ERP, eCommerce, etc.)
       |
       v
Event Ingestion Service (:3151)
  - Recibe el evento del sistema origen
  - Normaliza los campos via mapeos de campo en runtime
       |
       v  (RabbitMQ)
Notification Engine Service (:3152)
  - Evalua reglas, determina destinatarios
  - Resuelve template y renderiza contenido
       |
       v  (RabbitMQ: xch.notifications.deliver)
Channel Router Service (:3154)
  - Recibe el DispatchMessage
  - Transforma a SendRequest estandar
  - Envia via HTTP POST al adapter
       |
       v  (HTTP POST /send)
WhatsApp Adapter Service (:3173)
  - Recibe SendRequest
  - Construye el payload de Meta API
  - Envia a Meta Cloud API
       |
       v  (HTTPS)
Meta Graph API v22.0
  POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages
```

> **Importante:** El adapter de WhatsApp es un "dumb pipe" (tuberia simple). Recibe contenido ya renderizado desde el Template Service. Los templates de Meta se usan como envoltorio de entrega, no para renderizar contenido.

---

## 2. Estructura del Mensaje Canonico (Entrada)

El adapter de WhatsApp recibe un `SendRequest` con la siguiente estructura:

```json
{
  "channel": "whatsapp",
  "recipient": {
    "address": "+50212345678",
    "name": "Juan Perez"
  },
  "content": {
    "subject": "",
    "body": "Texto del mensaje renderizado",
    "media": []
  },
  "metadata": {
    "notificationId": "notif-abc-123",
    "correlationId": "corr-456",
    "cycleId": "cycle-789",
    "priority": "normal",
    "templateName": "nombre_del_template_en_meta",
    "templateLanguage": "es_MX",
    "templateParameters": [
      { "name": "nombre_parametro_1", "value": "valor_1" },
      { "name": "nombre_parametro_2", "value": "valor_2" }
    ]
  }
}
```

### Campos Clave para Operaciones

| Campo | Descripcion | Obligatorio |
|---|---|---|
| `recipient.address` | Numero de telefono del destinatario (formato E.164, ej: `+50212345678`) | Si |
| `metadata.templateName` | Nombre exacto del template aprobado en Meta Business Manager | Si (para templates) |
| `metadata.templateLanguage` | Codigo de idioma del template (ej: `es_MX`, `en_US`, `en`) | No (default: `en`) |
| `metadata.templateParameters` | Lista de parametros con nombre y valor para inyectar en el template | No |
| `content.body` | Texto del mensaje (usado en mensajes de texto o como fallback para parametros) | Segun tipo |

---

## 3. Mapeo a la Meta Cloud API (Salida)

### Transformacion de Parametros

El sistema transforma `metadata.templateParameters` al formato que Meta espera:

**Entrada (nuestro formato):**
```json
{
  "templateParameters": [
    { "name": "customer_name", "value": "Juan Perez" },
    { "name": "order_id", "value": "ORD-2024-001" }
  ]
}
```

**Salida (formato Meta API):**
```json
{
  "components": [
    {
      "type": "body",
      "parameters": [
        {
          "type": "text",
          "parameter_name": "customer_name",
          "text": "Juan Perez"
        },
        {
          "type": "text",
          "parameter_name": "order_id",
          "text": "ORD-2024-001"
        }
      ]
    }
  ]
}
```

### Regla de Mapeo

Cada elemento del array `templateParameters` se transforma asi:

```
templateParameters[i].name   -->  components[0].parameters[i].parameter_name
templateParameters[i].value  -->  components[0].parameters[i].text
(siempre)                    -->  components[0].parameters[i].type = "text"
(siempre)                    -->  components[0].type = "body"
```

### Fallback: Si No Hay templateParameters

Si `metadata.templateParameters` esta vacio o no existe, el sistema usa `content.body` como respaldo, dividiendolo por comas:

```
content.body = "Juan Perez,ORD-2024-001,Enviado"
```

Se transforma en:
```json
{
  "components": [
    {
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Juan Perez" },
        { "type": "text", "text": "ORD-2024-001" },
        { "type": "text", "text": "Enviado" }
      ]
    }
  ]
}
```

> **Nota:** El fallback por comas NO usa `parameter_name`. Los parametros se envian en orden posicional. Se recomienda siempre usar `templateParameters` con nombres explicitos.

---

## 4. Tipos de Mensaje Soportados

El adapter decide el tipo de mensaje segun una jerarquia de 3 prioridades:

### Prioridad 1: Template Explicito (Recomendado)

Se activa cuando: `metadata.templateName` esta presente.

```json
{
  "metadata": {
    "templateName": "order_update",
    "templateLanguage": "es_MX",
    "templateParameters": [
      { "name": "customer_name", "value": "Juan" }
    ]
  }
}
```

**Este es el flujo principal del pipeline de notificaciones.**

### Prioridad 2: Template via Subject (Legacy)

Se activa cuando: `content.subject` comienza con `template:`.

Formato del subject:
```
template:{nombre_template}
template:{nombre_template}:{codigo_idioma}
```

Parametros se toman del body separados por comas.

```json
{
  "content": {
    "subject": "template:order_update:es_MX",
    "body": "Juan,ORD-123,Enviado"
  }
}
```

> **Nota:** Este metodo es legacy y se recomienda usar Prioridad 1.

### Prioridad 3: Mensaje con Media

Se activa cuando: `content.media[0].url` existe (y no hay template).

Tipos soportados:
- `image/*` → mensaje tipo imagen
- `video/*` → mensaje tipo video
- Otro → mensaje tipo documento

### Default: Mensaje de Texto

Si ninguna de las anteriores aplica, se envia como texto plano.

> **Restriccion de Meta:** Los mensajes de texto solo funcionan dentro de la ventana de conversacion de 24 horas. Fuera de esa ventana, solo se pueden enviar templates aprobados.

---

## 5. Como Configurar un Nuevo Template de Meta

### Paso 1: Crear el Template en Meta Business Manager

1. Ir a [Meta Business Suite](https://business.facebook.com/) → WhatsApp Manager → Message Templates
2. Crear un nuevo template con:
   - **Nombre:** usar snake_case (ej: `order_delay_notification`)
   - **Idioma:** seleccionar los idiomas requeridos (ej: `es_MX`, `en_US`)
   - **Categoria:** elegir la categoria apropiada (Marketing, Utility, Authentication)
   - **Cuerpo del mensaje:** definir el texto con variables

**Ejemplo de template en Meta:**
```
Hola {{customer_name}}, tu pedido {{order_id}} tiene un retraso estimado
de {{delay_days}} dias. Disculpa las molestias.
```

Este template tiene 3 parametros: `customer_name`, `order_id`, `delay_days`.

3. Enviar a aprobacion y esperar que Meta lo apruebe.

### Paso 2: Configurar la Regla de Notificacion

En el Notification Engine Service, crear o actualizar la regla que debe activar este template. La regla debe definir:

- **Evento disparador:** El tipo de evento del sistema origen (ej: `order.delay`)
- **Canal:** `whatsapp`
- **Template de renderizado:** El template interno que genera los parametros
- **Destinatario:** El campo del evento que contiene el telefono

### Paso 3: Crear el Mapeo de Parametros

Configurar el Template Service para que al renderizar el contenido, produzca los campos correctos en `metadata.templateParameters`:

| Parametro en Meta | Campo del Evento Origen | Ejemplo de Valor |
|---|---|---|
| `customer_name` | `event.data.customer.name` | "Juan Perez" |
| `order_id` | `event.data.orderId` | "ORD-2024-001" |
| `delay_days` | `event.data.estimatedDelay` | "3" |

El resultado esperado en el `SendRequest`:

```json
{
  "metadata": {
    "templateName": "order_delay_notification",
    "templateLanguage": "es_MX",
    "templateParameters": [
      { "name": "customer_name", "value": "Juan Perez" },
      { "name": "order_id", "value": "ORD-2024-001" },
      { "name": "delay_days", "value": "3" }
    ]
  }
}
```

### Paso 4: Verificar con Modo de Pruebas

Antes de activar en produccion:

1. Configurar `WHATSAPP_TEST_MODE=true` en el ambiente de pruebas
2. Enviar un evento de prueba y verificar que el adapter recibe el `SendRequest` correcto
3. Cambiar a `WHATSAPP_TEST_MODE=false` y probar con un numero real registrado en el sandbox de Meta

---

## 6. Ejemplos Completos

### Ejemplo 1: Confirmacion de Pedido

**Template en Meta (nombre: `order_confirmation`):**
```
Hola {{customer_name}}, tu pedido {{order_id}} ha sido confirmado.
Total: {{order_total}}. Fecha estimada de entrega: {{delivery_date}}.
Gracias por tu compra.
```

**Entrada al adapter (SendRequest):**
```json
{
  "channel": "whatsapp",
  "recipient": {
    "address": "+50287654321",
    "name": "Maria Lopez"
  },
  "content": {
    "body": "Contenido renderizado internamente"
  },
  "metadata": {
    "notificationId": "notif-order-001",
    "correlationId": "corr-111",
    "priority": "normal",
    "templateName": "order_confirmation",
    "templateLanguage": "es_MX",
    "templateParameters": [
      { "name": "customer_name", "value": "Maria Lopez" },
      { "name": "order_id", "value": "ORD-2024-500" },
      { "name": "order_total", "value": "Q 1,250.00" },
      { "name": "delivery_date", "value": "15 de marzo 2026" }
    ]
  }
}
```

**Payload enviado a Meta Cloud API:**
```json
{
  "messaging_product": "whatsapp",
  "to": "50287654321",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": {
      "code": "es_MX"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "parameter_name": "customer_name", "text": "Maria Lopez" },
          { "type": "text", "parameter_name": "order_id", "text": "ORD-2024-500" },
          { "type": "text", "parameter_name": "order_total", "text": "Q 1,250.00" },
          { "type": "text", "parameter_name": "delivery_date", "text": "15 de marzo 2026" }
        ]
      }
    ]
  }
}
```

**Respuesta exitosa de Meta:**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [
    { "input": "50287654321", "wa_id": "50287654321" }
  ],
  "messages": [
    { "id": "wamid.HBgLNTAyODc2NTQzMjEVAgASGBI2RjM5..." }
  ]
}
```

**Resultado del adapter (SendResult):**
```json
{
  "success": true,
  "providerMessageId": "wamid.HBgLNTAyODc2NTQzMjEVAgASGBI2RjM5...",
  "retryable": false,
  "errorMessage": null,
  "httpStatus": 200
}
```

---

### Ejemplo 2: Notificacion de Envio con Tracking

**Template en Meta (nombre: `shipment_tracking`):**
```
{{customer_name}}, tu pedido {{order_id}} ha sido enviado.
Numero de rastreo: {{tracking_number}}.
Transportista: {{carrier_name}}.
```

**Entrada al adapter:**
```json
{
  "channel": "whatsapp",
  "recipient": {
    "address": "+50255001234",
    "name": "Carlos Mendoza"
  },
  "content": {
    "body": ""
  },
  "metadata": {
    "notificationId": "notif-ship-042",
    "priority": "normal",
    "templateName": "shipment_tracking",
    "templateLanguage": "es_MX",
    "templateParameters": [
      { "name": "customer_name", "value": "Carlos Mendoza" },
      { "name": "order_id", "value": "ORD-2024-789" },
      { "name": "tracking_number", "value": "GT-TRACK-88812345" },
      { "name": "carrier_name", "value": "Cargo Expreso" }
    ]
  }
}
```

**Payload a Meta:**
```json
{
  "messaging_product": "whatsapp",
  "to": "50255001234",
  "type": "template",
  "template": {
    "name": "shipment_tracking",
    "language": { "code": "es_MX" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "parameter_name": "customer_name", "text": "Carlos Mendoza" },
          { "type": "text", "parameter_name": "order_id", "text": "ORD-2024-789" },
          { "type": "text", "parameter_name": "tracking_number", "text": "GT-TRACK-88812345" },
          { "type": "text", "parameter_name": "carrier_name", "text": "Cargo Expreso" }
        ]
      }
    ]
  }
}
```

---

### Ejemplo 3: Template Simple sin Parametros

**Template en Meta (nombre: `welcome_message`):**
```
Bienvenido a nuestra tienda. Estamos aqui para ayudarte.
```

**Entrada al adapter:**
```json
{
  "channel": "whatsapp",
  "recipient": {
    "address": "+50241009876"
  },
  "content": {
    "body": ""
  },
  "metadata": {
    "notificationId": "notif-welcome-001",
    "templateName": "welcome_message",
    "templateLanguage": "es_MX"
  }
}
```

**Payload a Meta (sin components ya que no hay parametros):**
```json
{
  "messaging_product": "whatsapp",
  "to": "50241009876",
  "type": "template",
  "template": {
    "name": "welcome_message",
    "language": { "code": "es_MX" }
  }
}
```

---

### Ejemplo 4: Metodo Legacy via Subject (No Recomendado)

**Entrada al adapter:**
```json
{
  "channel": "whatsapp",
  "recipient": {
    "address": "+50212345678"
  },
  "content": {
    "subject": "template:payment_reminder:es_MX",
    "body": "Juan Perez,INV-2024-100,Q 500.00,20 de marzo 2026"
  },
  "metadata": {
    "notificationId": "notif-pay-001"
  }
}
```

**El sistema parsea:**
- Template: `payment_reminder`
- Idioma: `es_MX`
- Parametros (del body, separados por coma): `["Juan Perez", "INV-2024-100", "Q 500.00", "20 de marzo 2026"]`

**Payload a Meta:**
```json
{
  "messaging_product": "whatsapp",
  "to": "50212345678",
  "type": "template",
  "template": {
    "name": "payment_reminder",
    "language": { "code": "es_MX" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Juan Perez" },
          { "type": "text", "text": "INV-2024-100" },
          { "type": "text", "text": "Q 500.00" },
          { "type": "text", "text": "20 de marzo 2026" }
        ]
      }
    ]
  }
}
```

> **Nota:** En este metodo los parametros son posicionales (sin `parameter_name`), por lo que el orden debe coincidir exactamente con el orden de las variables en el template de Meta.

---

### Ejemplo 5: Mensaje con Media (Imagen)

**Entrada al adapter:**
```json
{
  "channel": "whatsapp",
  "recipient": {
    "address": "+50212345678"
  },
  "content": {
    "body": "Tu factura del mes de febrero",
    "media": [
      {
        "url": "https://storage.example.com/invoices/inv-2024-100.pdf",
        "contentType": "application/pdf",
        "filename": "Factura-Febrero-2024.pdf"
      }
    ]
  },
  "metadata": {
    "notificationId": "notif-invoice-001"
  }
}
```

**Payload a Meta (tipo documento):**
```json
{
  "messaging_product": "whatsapp",
  "to": "50212345678",
  "type": "document",
  "document": {
    "link": "https://storage.example.com/invoices/inv-2024-100.pdf",
    "caption": "Tu factura del mes de febrero",
    "filename": "Factura-Febrero-2024.pdf"
  }
}
```

> **Restriccion:** Los mensajes con media solo funcionan dentro de la ventana de conversacion de 24 horas.

---

## 7. Formato de Numeros de Telefono

El adapter formatea automaticamente los numeros de telefono:

| Entrada | Resultado | Explicacion |
|---|---|---|
| `+50212345678` | `50212345678` | Se elimina el `+` inicial |
| `50212345678` | `50212345678` | Sin cambio |
| `+1 (555) 123-4567` | `1 (555) 123-4567` | Solo se elimina el `+` |

> **Recomendacion:** Siempre enviar el numero en formato E.164 completo (con codigo de pais) incluyendo el `+`. Ejemplo: `+502XXXXXXXX` para Guatemala.

---

## 8. Errores Comunes y Solucion

| Codigo | Error | Causa | Solucion | Reintentable |
|---|---|---|---|---|
| WA-006 | Template not found | El nombre del template no coincide con uno aprobado en Meta | Verificar nombre exacto en Meta Business Manager | No |
| WA-008 | Parameter mismatch | Cantidad o nombres de parametros no coinciden con el template | Verificar que los `templateParameters` coincidan con las variables del template | No |
| WA-005 | Not on WhatsApp | El numero no esta registrado en WhatsApp | Verificar numero del destinatario | No |
| WA-010 | 24h window expired | Intentar enviar texto/media fuera de la ventana de 24h | Usar template aprobado en lugar de texto/media | No |
| WA-007 | Rate limit | Demasiados mensajes enviados | Esperar y reintentar automaticamente | Si |
| WA-004 | Invalid token | Token de acceso invalido o expirado | Regenerar `META_ACCESS_TOKEN` | No |
| WA-009 | Policy violation | Contenido viola politicas de Meta | Revisar contenido del mensaje | No |
| WA-002 | API unavailable | Error temporal de Meta | Reintento automatico | Si |

---

## 9. Modo de Pruebas (Test Mode)

Al configurar `WHATSAPP_TEST_MODE=true`, **todos los mensajes** se reemplazan con el template de prueba `hello_world` de Meta:

```json
{
  "messaging_product": "whatsapp",
  "to": "<numero_original>",
  "type": "template",
  "template": {
    "name": "hello_world",
    "language": { "code": "en_US" }
  }
}
```

Esto es util para:
- Validar que la conectividad con Meta funciona
- Probar el flujo completo sin necesidad de templates aprobados
- Verificar que los numeros de telefono son validos

> **Importante:** El template `hello_world` viene pre-aprobado por Meta en todas las cuentas de WhatsApp Business.

---

## 10. Variables de Entorno

| Variable | Descripcion | Default | Obligatorio |
|---|---|---|---|
| `META_ACCESS_TOKEN` | Token de acceso permanente (System User) | — | Si |
| `META_PHONE_NUMBER_ID` | ID del numero de telefono en WhatsApp Business | — | Si |
| `META_APP_SECRET` | Secreto de la app para validacion HMAC de webhooks | — | Si |
| `META_WEBHOOK_VERIFY_TOKEN` | Token para el challenge GET de verificacion de webhooks | — | Si |
| `META_API_VERSION` | Version del Graph API | `v22.0` | No |
| `META_DEFAULT_TEMPLATE_LANGUAGE` | Idioma por defecto para templates | `en` | No |
| `WHATSAPP_PORT` | Puerto HTTP del adapter | `3173` | No |
| `WHATSAPP_TEST_MODE` | Enviar siempre `hello_world` | `false` | No |
| `WHATSAPP_TLS_REJECT_UNAUTHORIZED` | Verificacion TLS | `true` | No |

---

## Resumen Rapido para Operaciones

Para agregar un nuevo template de WhatsApp:

1. **Crear** el template en Meta Business Manager con las variables necesarias
2. **Esperar** aprobacion de Meta
3. **Configurar** la regla en Notification Engine con el evento disparador
4. **Mapear** los campos del evento origen a `templateParameters` con los mismos nombres que las variables del template de Meta
5. **Probar** en modo test, luego en sandbox, y finalmente en produccion

**Checklist de verificacion:**
- [ ] El `templateName` coincide exactamente con el nombre en Meta
- [ ] El `templateLanguage` coincide con el idioma aprobado
- [ ] Cada variable del template tiene su correspondiente entrada en `templateParameters`
- [ ] Los nombres en `templateParameters[].name` coinciden con los nombres de las variables en Meta
- [ ] El numero de telefono incluye codigo de pais
