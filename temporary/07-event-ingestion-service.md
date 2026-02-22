# 07 — Servicio de Ingesta de Eventos

**Notification API — Profundizacion en la Ingesta de Eventos**

| | |
|---|---|
| **Version:** | 2.0 |
| **Fecha:** | 2026-02-20 |
| **Autor:** | Equipo de Arquitectura |
| **Estado:** | **[En Revision]** |

---

## Tabla de Contenidos

1. [Descripcion General del Servicio](#1-descripcion-general-del-servicio)
2. [Arquitectura y Puntos de Integracion](#2-arquitectura-y-puntos-de-integracion)
3. [Integracion de Sistemas Fuente](#3-integracion-de-sistemas-fuente)
4. [Pipeline de Procesamiento de Eventos](#4-pipeline-de-procesamiento-de-eventos)
5. [Topologia de RabbitMQ](#5-topologia-de-rabbitmq)
6. [Endpoints de la API REST](#6-endpoints-de-la-api-rest)
7. [Esquema Canonico de Eventos](#7-esquema-canonico-de-eventos)
8. [Diseno de Base de Datos](#8-diseno-de-base-de-datos)
9. [Validacion de Eventos](#9-validacion-de-eventos)
10. [Idempotencia y Deduplicacion](#10-idempotencia-y-deduplicacion)
11. [Diagramas de Secuencia](#11-diagramas-de-secuencia)
12. [Manejo de Errores y Colas de Mensajes Muertos](#12-manejo-de-errores-y-colas-de-mensajes-muertos)
13. [Monitoreo y Chequeos de Salud](#13-monitoreo-y-chequeos-de-salud)
14. [Configuracion](#14-configuracion)

---

## 1. Descripcion General del Servicio

El Servicio de Ingesta de Eventos es el punto de entrada universal para todos los eventos de negocio que pueden activar notificaciones dentro de la plataforma. Recibe eventos de cualquier sistema fuente registrado, aplica mapeos de campos configurados en tiempo de ejecucion por el administrador para normalizarlos a un formato canonico plano, y los publica en el exchange interno de RabbitMQ para el procesamiento posterior por parte del Motor de Notificaciones.

| Atributo | Valor |
|---|---|
| **Tecnologia** | NestJS (TypeScript) con consumidores RabbitMQ (`@golevelup/nestjs-rabbitmq`) |
| **Puerto** | `3151` |
| **Esquema** | PostgreSQL — `event_ingestion_service` |
| **Dependencias** | RabbitMQ, PostgreSQL |
| **Carpeta en Repositorio** | `event-ingestion-service/` |

### Responsabilidades

1. **Consumidores RabbitMQ:** Consumidores genericos en las colas `q.events.amqp` y `q.events.email-ingest` que aceptan eventos de cualquier sistema fuente que publique en el exchange `events.incoming`.
2. **Endpoint REST de Webhook:** Un endpoint HTTP (`POST /webhooks/events`) para integraciones externas que no pueden publicar directamente en RabbitMQ — incluyendo sistemas fuente con capacidad de webhook, envios del Servicio de Carga Masiva y activaciones manuales a traves del Gateway.
3. **Configuracion de Mapeo en Tiempo de Ejecucion:** Mapeo de campos dirigido por el administrador, identificado por `(sourceId, eventType)` — no se requieren cambios de codigo para incorporar un nuevo sistema fuente. Las configuraciones de mapeo definen rutas de extraccion de campos, transformaciones, resolucion de tipos de evento y esquemas de validacion opcionales.
4. **Normalizacion de Eventos:** Transforma payloads especificos de cada fuente al formato canonico plano de eventos usando el motor de mapeo en tiempo de ejecucion — extraccion de campos, funciones de transformacion, normalizacion de marcas de tiempo (ISO-8601 UTC) y enriquecimiento de metadatos.
5. **Publicacion de Eventos Normalizados:** Publica eventos validados y normalizados en el exchange `events.normalized` con claves de enrutamiento para consumidores posteriores.
6. **Persistencia de Eventos:** Almacena todos los eventos crudos y normalizados en PostgreSQL para auditabilidad y capacidades de replay.
7. **Idempotencia y Deduplicacion:** Mantiene una ventana de deduplicacion usando claves compuestas para prevenir el procesamiento duplicado de eventos.

> **Info:** **Configuracion de Mapeo en Tiempo de Ejecucion**
>
> Los sistemas fuente se integran a traves de reglas de mapeo configuradas por el administrador almacenadas en la tabla `event_mappings`, no mediante adaptadores codificados. Cada configuracion de mapeo define como extraer campos de un payload fuente, que transformaciones aplicar, y como resolver tipos de evento. Incorporar un nuevo sistema fuente solo requiere registrar la fuente en `event_sources` y crear configuraciones de mapeo a traves de la UI de Administracion — sin cambios de codigo ni despliegues necesarios.

---

## 2. Arquitectura y Puntos de Integracion

El Servicio de Ingesta de Eventos se ubica entre los sistemas fuente externos y el pipeline interno de notificaciones. Actua como la capa de normalizacion — aceptando eventos en diversos formatos de cualquier sistema upstream registrado y produciendo un formato canonico de eventos unico y consistente consumido por el Motor de Notificaciones downstream.

### Dependencias Upstream y Downstream

| Direccion | Sistema | Protocolo | Descripcion |
|---|---|---|---|
| **Upstream** | Cualquier Fuente (AMQP) | RabbitMQ (AMQP) | Publica eventos en el exchange `events.incoming` con clave de enrutamiento `source.{sourceId}.{eventType}` |
| **Upstream** | Cualquier Fuente (Webhook) | REST Webhook | Envia HTTP POST con autenticacion (clave API, HMAC, o token bearer) a `/webhooks/events` |
| **Upstream** | Servicio de Ingesta de Email | RabbitMQ (AMQP) | Publica eventos de email parseados en el exchange `events.incoming` |
| **Upstream** | Servicio de Carga Masiva | REST (HTTP) | Envia filas XLSX parseadas como eventos via `POST /webhooks/events` |
| **Upstream** | Activacion Manual | REST via Gateway | Usuarios administradores activan eventos a traves del Gateway → `POST /webhooks/events` |
| **Downstream** | Motor de Notificaciones | RabbitMQ (AMQP) | Consume eventos normalizados del exchange `events.normalized` |
| **Downstream** | Servicio de Auditoria | RabbitMQ (AMQP) | Consume actualizaciones del ciclo de vida de eventos para rastro de auditoria |

### Figura 2.1 — Contexto de Integracion

```
┌──────────────────────┐
│ Fuente A (RabbitMQ)   │──┐
├──────────────────────┤  │
│ Fuente B (Webhook)    │──┤
├──────────────────────┤  │      ┌─────────────────────────────┐      ┌───────────────────────┐
│ Fuente C (Webhook)    │──┼─────▶│  Servicio Ingesta Eventos   │─────▶│   events.normalized   │
├──────────────────────┤  │      │   :3151                     │      │   (Topic Exchange)    │
│ Ingesta Email (AMQP)  │──┤      │   Mapear·Validar·Normalizar│      └───────────┬───────────┘
├──────────────────────┤  │      │   PostgreSQL                │                  │
│  Carga Masiva (HTTP)  │──┤      └─────────────────────────────┘          ┌────────┴────────┐
├──────────────────────┤  │                                               │                 │
│ Activac. Manual (REST)│──┘                                    ┌──────────┴──┐  ┌───────────┴──┐
├──────────────────────┤                                       │    Motor de  │  │  Servicio de │
│ Fuente N (AMQP/HTTP)  │──────▶ ... (cualquier fuente reg.)   │ Notific :3152│  │ Auditoria    │
└──────────────────────┘                                       └─────────────┘  │       :3156  │
                                                                                └──────────────┘
```

---

## 3. Integracion de Sistemas Fuente

Los sistemas fuente se integran con el Servicio de Ingesta de Eventos a traves de uno de dos patrones: **AMQP directo** o **webhook REST**. No existe una lista codificada de sistemas fuente — cualquier sistema puede ser incorporado registrandolo en la tabla `event_sources` y creando configuraciones de mapeo en tiempo de ejecucion en la tabla `event_mappings` via la UI de Administracion.

### 3.1 Patrones de Integracion

#### Patron A — AMQP Directo

Los sistemas fuente que pueden publicar directamente en RabbitMQ envian mensajes al exchange de tipo topic `events.incoming` con clave de enrutamiento `source.{sourceId}.{eventType}`. El Servicio de Ingesta de Eventos los consume desde la cola generica `q.events.amqp`.

| Atributo | Valor |
|---|---|
| **Exchange** | `events.incoming` (topic) |
| **Cola** | `q.events.amqp` |
| **Clave de Enrutamiento** | `source.{sourceId}.{eventType}` (ej., `source.erp-system-1.order.shipped`) |
| **Concurrencia** | Configurable (por defecto: 3 consumidores) |
| **Prefetch** | Configurable (por defecto: 10) |

#### Patron B — Webhook REST

Los sistemas fuente que se integran via HTTP envian una solicitud POST a `/webhooks/events` con el campo `sourceId` en el cuerpo de la solicitud. La autenticacion se verifica contra las credenciales almacenadas en la tabla `event_sources` (clave API, secreto de firma HMAC, o token bearer).

| Atributo | Valor |
|---|---|
| **Endpoint** | `POST /webhooks/events` |
| **Autenticacion** | Por fuente: clave API (cabecera `X-API-Key`), firma HMAC (cabecera `X-Signature`), o token bearer (cabecera `Authorization`) |
| **Identificador de Fuente** | Campo `sourceId` en el cuerpo de la solicitud |
| **Limite de Tasa** | Por fuente, configurado en la tabla `event_sources` |

> **Info:** **Servicio de Ingesta de Email** — El Servicio de Ingesta de Email (puerto 3157/2525) recibe correos electronicos de sistemas cerrados/legados que no pueden integrarse via API o RabbitMQ. Parsea el contenido del correo usando reglas configurables, extrae datos estructurados y publica eventos normalizados en el exchange `events.incoming` con clave de enrutamiento `source.email-ingest.{eventType}`. El Servicio de Ingesta de Eventos los consume desde la cola dedicada `q.events.email-ingest` y los procesa de forma identica a cualquier otra fuente.

### 3.2 Configuracion de Mapeo en Tiempo de Ejecucion

Los eventos de cada sistema fuente se normalizan usando reglas de mapeo configuradas por el administrador almacenadas en la tabla `event_mappings`. Los mapeos se identifican por `(sourceId, eventType)` y definen como extraer y transformar campos del payload fuente al formato canonico plano de eventos.

#### Tabla de Configuracion de Mapeo

| Columna | Tipo | Descripcion |
|---|---|---|
| `id` | UUID | Clave primaria |
| `source_id` | VARCHAR(50) | Identificador del sistema fuente registrado |
| `event_type` | VARCHAR(100) | Tipo de evento canonico (o `*` para comodin) |
| `name` | VARCHAR(255) | Nombre legible del mapeo |
| `field_mappings` | JSONB | Reglas de extraccion y transformacion de campos |
| `event_type_mapping` | JSONB | Tipos de evento fuente → tipos de evento canonicos |
| `timestamp_field` | VARCHAR(255) | Ruta con puntos al timestamp en el payload fuente |
| `timestamp_format` | VARCHAR(50) | Formato del timestamp (`iso8601`, `epoch_ms`, `epoch_s`, personalizado) |
| `source_event_id_field` | VARCHAR(255) | Ruta con puntos al ID de deduplicacion fuente |
| `validation_schema` | JSONB | JSON Schema opcional para validacion del payload entrante |
| `priority` | VARCHAR(10) | Nivel de prioridad del evento: `normal` (por defecto) o `critical`. Determina el segmento de clave de enrutamiento al publicar en `events.normalized`. |
| `is_active` | BOOLEAN | Solo se usan los mapeos activos |
| `version` | INTEGER | Version de configuracion para rastro de auditoria |

Ver [Seccion 8 — Diseno de Base de Datos](#8-diseno-de-base-de-datos) para el DDL completo de la tabla.

#### Estructura de Reglas de Mapeo de Campos

Cada clave en `field_mappings` es un nombre de campo canonico. El valor define como extraer y transformar datos del payload fuente:

```json
{
  "customerId": {
    "source": "customer.id",
    "transform": "direct",
    "required": true
  },
  "orderId": {
    "source": "order_reference",
    "transform": "prefix",
    "options": { "prefix": "ERP-" },
    "required": true
  },
  "customerName": {
    "source": ["customer.first_name", "customer.last_name"],
    "transform": "concatenate",
    "options": { "separator": " " }
  },
  "currency": {
    "source": "currency_code",
    "transform": "direct",
    "default": "USD"
  },
  "items": {
    "source": "line_items",
    "transform": "arrayMap",
    "options": { "fieldRenames": { "qty": "quantity", "unit_price": "price" } }
  }
}
```

#### Propiedades de Reglas de Mapeo de Campos

| Propiedad | Tipo | Requerida | Descripcion |
|---|---|---|---|
| `source` | string \| string[] | Si (excepto `static`) | Ruta con puntos al valor en el payload fuente (ej., `"customer.id"`). Usar un arreglo para transformaciones que combinan multiples campos (ej., `concatenate`). Se ignora cuando la transformacion es `static`. |
| `transform` | string | No (por defecto: `direct`) | Funcion de transformacion a aplicar al valor extraido. Ver Transformaciones Soportadas abajo. |
| `options` | object | Condicional | Opciones especificas de la transformacion (ej., `{ "prefix": "ERP-" }`). Requerida por algunas transformaciones, ignorada por otras. |
| `required` | boolean | No (por defecto: `false`) | Si es `true`, el campo debe estar presente y no ser null en el payload fuente (despues de aplicar `default`). Un campo requerido faltante causa el rechazo del evento. |
| `default` | any | No | Valor de respaldo usado cuando la ruta fuente resuelve a `null`, `undefined`, o esta ausente del payload. El default se aplica **antes** de la transformacion — es decir, la funcion de transformacion recibe el valor default como entrada. Si un campo tiene tanto `required: true` como un `default`, el default satisface la verificacion de requerido. No aplica cuando la transformacion es `static` (usar `options.value` en su lugar). |

#### Transformaciones Soportadas

| Transformacion | Descripcion | Opciones |
|---|---|---|
| `direct` | Copiar valor tal cual desde la ruta fuente | — |
| `concatenate` | Unir multiples valores fuente | `separator` (string) |
| `map` | Buscar valor en una tabla de mapeo | `mappings` (objeto: fuente → destino) |
| `prefix` | Anteponer una cadena | `prefix` (string) |
| `suffix` | Anexar una cadena | `suffix` (string) |
| `template` | Plantilla estilo Handlebars | `template` (string) |
| `dateFormat` | Parsear y reformatear una cadena de fecha | `inputFormat`, `outputFormat` |
| `epochToIso` | Convertir timestamp epoch a ISO-8601 | `unit` (`ms` o `s`) |
| `toNumber` | Convertir a numero | — |
| `toString` | Convertir a cadena | — |
| `arrayMap` | Transformar elementos de un arreglo | `fieldRenames` (objeto) |
| `jsonPath` | Extraer via expresion JSONPath | `expression` (string) |
| `static` | Usar un valor fijo | `value` (cualquiera) |

#### Mapeo de Tipos de Evento

El campo `event_type_mapping` mapea valores de tipo de evento especificos de la fuente a tipos de evento canonicos con notacion de puntos:

```json
{
  "ORDER_SHIPPED": "order.shipped",
  "ORDER_CREATED": "order.created",
  "ORDER_CANCELLED": "order.cancelled",
  "PAYMENT_CONFIRMED": "payment.confirmed"
}
```

#### Resolucion de Mapeo en Tiempo de Ejecucion

1. Extraer `sourceId` de la clave de enrutamiento (AMQP: segundo segmento de `source.{sourceId}.{eventType}`) o del cuerpo de la solicitud (webhook: campo `sourceId`).
2. Si `eventTypeMapping` esta configurado para esta fuente, resolver el tipo de evento crudo al tipo de evento canonico.
3. Buscar la fila activa de `event_mappings` para `(sourceId, eventType)`.
4. **Fallback:** Si no hay coincidencia exacta, intentar con comodin `(sourceId, '*')`.
5. **No encontrado:** Rechazar con `422 Unprocessable Entity` y error `"No se encontro configuracion de mapeo para la fuente '{sourceId}' y tipo de evento '{eventType}'"`.
6. Si el mapeo tiene un `validationSchema`, validar el payload entrante contra el mismo usando `ajv`.
7. Aplicar reglas de mapeo de campos usando el motor de mapeo — para cada campo, extraer el valor fuente; si el valor esta ausente/null y hay un `default` configurado, sustituir el default antes de aplicar la transformacion → producir evento canonico plano.
8. Validar que todos los campos canonicos requeridos esten presentes (los campos con un `default` que fue aplicado satisfacen la verificacion de requerido).

#### Estrategia de Cache de Mapeo

Por defecto (`MAPPING_CACHE_ENABLED=false`), cada busqueda de mapeo consulta PostgreSQL directamente — no hay capa de cache involucrada. Este es el modo mas simple y adecuado para desarrollo, entornos de bajo rendimiento y despliegues simples.

Cuando `MAPPING_CACHE_ENABLED=true`, el servicio utiliza un **cache eagerly** con **invalidacion dirigida por eventos** para mantener la base de datos completamente fuera del camino critico:

**Fase 1 — Precarga Eager**

Al iniciar, antes de que el servicio comience a aceptar eventos, ejecuta:

```sql
SELECT * FROM event_mappings WHERE is_active = true;
```

Todas las filas se cargan en un `Map<sourceId:eventType, MappingConfig>` en memoria. El servicio no vincula sus consumidores RabbitMQ ni abre el endpoint de webhook hasta que el cache este completamente poblado.

**Fase 2 — Invalidacion Dirigida por Eventos**

Cada vez que un mapeo se crea, actualiza o desactiva a traves del Servicio de Administracion, este publica un evento de invalidacion en el exchange `config.events` con clave de enrutamiento `config.mapping.changed`. El payload del evento contiene el `id` del mapeo y el nuevo numero de `version`.

El Servicio de Ingesta de Eventos se suscribe a traves de la cola `q.config.mapping-cache`. Al recibir un evento de invalidacion:

1. Obtiene la fila actualizada de `event_mappings` desde PostgreSQL por `id`.
2. Compara la `version` obtenida con la version en cache.
3. Si la version obtenida es mas reciente, reemplaza la entrada en el cache (o la elimina si `is_active = false`).
4. Si la version obtenida es igual o anterior (entrega fuera de orden), el evento se descarta.

```
  Servicio Admin                  RabbitMQ                    Servicio Ingesta Eventos
       │                              │                                │
       │  Mapeo actualizado           │                                │
       │  (via UI Admin)              │                                │
       │                              │                                │
       │  Publicar en config.events   │                                │
       │  key: config.mapping.changed │                                │
       │─────────────────────────────▶│                                │
       │                              │  Entregar a                    │
       │                              │  q.config.mapping-cache        │
       │                              │───────────────────────────────▶│
       │                              │                                │
       │                              │                    ┌───────────┴───────────┐
       │                              │                    │ 1. Obtener fila       │
       │                              │                    │    actualizada de PG  │
       │                              │                    │ 2. Comparar version   │
       │                              │                    │ 3. Reemplazar en cache│
       │                              │                    │    (si es mas reciente)│
       │                              │                    └───────────┬───────────┘
       │                              │                                │
       │                              │                    Cache actualizado (~100ms)
```

**Patron Single-Flight**

En un cache miss (ej., un mapeo nuevo aun no recibido via evento de invalidacion), solo se emite una consulta a la base de datos por clave de cache. Las solicitudes concurrentes para el mismo `(sourceId, eventType)` esperan a que la consulta en vuelo se complete en lugar de emitir consultas redundantes.

> **Info:** **Cuando Habilitar el Cache**
>
> Habilitar `MAPPING_CACHE_ENABLED=true` en entornos de **produccion** y **alto rendimiento** donde las busquedas de mapeo de otro modo agregarian latencia innecesaria y presion a la base de datos en cada evento. Dejarlo deshabilitado (`false`) en **desarrollo** y **despliegues simples** donde se prefiere la simplicidad operativa de consultas directas a la base de datos y los volumenes de eventos son bajos.

### 3.3 Ejemplo — Incorporacion de una Nueva Fuente

Este ejemplo muestra como incorporar un sistema ERP que publica eventos de ordenes via RabbitMQ.

**Paso 1:** Registrar la fuente en `event_sources`:

| Campo | Valor |
|---|---|
| `name` | `erp-system-1` |
| `display_name` | `Sistema ERP (Almacen)` |
| `type` | `rabbitmq` |
| `is_active` | `true` |

**Paso 2:** Crear una configuracion de mapeo en `event_mappings`:

```json
{
  "sourceId": "erp-system-1",
  "eventType": "order.shipped",
  "name": "Mapeo ERP Orden Enviada",
  "fieldMappings": {
    "customerId": { "source": "customer.id", "transform": "direct", "required": true },
    "cycleId": { "source": "cycle_id", "transform": "direct", "required": true },
    "orderId": { "source": "order_reference", "transform": "prefix", "options": { "prefix": "ERP-" }, "required": true },
    "customerEmail": { "source": "customer.email", "transform": "direct", "required": true },
    "customerPhone": { "source": "customer.phone", "transform": "direct" },
    "customerName": { "source": ["customer.first_name", "customer.last_name"], "transform": "concatenate", "options": { "separator": " " } },
    "items": { "source": "line_items", "transform": "arrayMap", "options": { "fieldRenames": { "qty": "quantity", "unit_price": "price" } } },
    "totalAmount": { "source": "order_total", "transform": "direct" },
    "currency": { "source": "currency_code", "transform": "direct" }
  },
  "eventTypeMapping": { "ORDER_SHIPPED": "order.shipped", "ORDER_CREATED": "order.created" },
  "timestampField": "occurred_at",
  "timestampFormat": "iso8601",
  "sourceEventIdField": "event_id",
  "priority": "normal"
}
```

**Paso 3:** El ERP publica en `events.incoming` con clave de enrutamiento `source.erp-system-1.order.shipped`. El Servicio de Ingesta de Eventos consume, aplica el mapeo y produce un evento canonico — sin cambios de codigo requeridos.

---

## 4. Pipeline de Procesamiento de Eventos

Cada evento — ya sea recibido via consumidor RabbitMQ o webhook REST — pasa por el mismo pipeline de procesamiento de 10 pasos. Esto garantiza validacion, normalizacion y publicacion consistentes independientemente del sistema fuente.

1. **Recibir Evento:** Aceptar evento crudo del consumidor RabbitMQ o endpoint de webhook REST.
2. **Extraer ID de Fuente:** Determinar el sistema fuente desde la clave de enrutamiento del mensaje (RabbitMQ: segundo segmento de `source.{sourceId}.{eventType}`) o campo `sourceId` (webhook).
3. **Busqueda de Fuente:** Verificar que la fuente este registrada y activa en la tabla `event_sources`.
4. **Busqueda de Mapeo:** Encontrar la fila activa de `event_mappings` para `(sourceId, eventType)`. Por defecto, las configuraciones de mapeo se obtienen directamente de PostgreSQL. Cuando `MAPPING_CACHE_ENABLED=true`, los mapeos se resuelven desde un cache en memoria con invalidacion dirigida por eventos (ver [Estrategia de Cache de Mapeo](#estrategia-de-cache-de-mapeo)). Fallback a comodin `(sourceId, '*')` si no hay coincidencia exacta.
5. **Validar (opcional):** Si la configuracion de mapeo incluye un `validationSchema`, validar el payload entrante contra el mismo usando `ajv`. En caso de fallo, rechazar con errores detallados.
6. **Verificacion de Deduplicacion:** Extraer el ID de evento fuente usando la ruta `sourceEventIdField` de la configuracion de mapeo. Verificar la clave compuesta `(source_id, source_event_id)` contra la tabla de eventos. Si existe una coincidencia dentro de la ventana de deduplicacion, devolver el ID de evento existente.
7. **Normalizar:** Aplicar el motor de mapeo en tiempo de ejecucion — extraer campos usando notacion de puntos, aplicar valores `default` para campos ausentes o null, aplicar transformaciones configuradas, resolver tipos de evento, normalizar timestamps a ISO-8601 UTC, asignar la `priority` de la configuracion de mapeo (por defecto: `normal`), y ensamblar el evento canonico plano.
8. **Enriquecer Metadatos:** Agregar `eventId` (UUID v4), `correlationId`, `receivedAt`, `normalizedAt`, `schemaVersion` ("2.0"), y `mappingConfigId` al objeto de metadatos.
9. **Persistir:** Insertar el registro del evento (crudo + normalizado) en la tabla `events` con estado `received`. Actualizar estado a `published` despues de publicacion exitosa.
10. **Publicar y ACK:** Publicar el evento normalizado en el exchange `events.normalized` con clave de enrutamiento `event.{priority}.{eventType}` (ej., `event.critical.order.delayed` o `event.normal.order.shipped`). Confirmar el mensaje RabbitMQ (o devolver `202 Accepted` para solicitudes de webhook).

### Figura 4.1 — Pipeline de Procesamiento de Eventos

```
    ┌─────────────────────────┐
    │    1. Recibir Evento     │  ◄── Msg RabbitMQ o HTTP POST
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │   2. Extraer ID Fuente   │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │   3. Busqueda de Fuente  │  ◄── Verificar registrada y activa
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │   4. Busqueda de Mapeo   │  ◄── (sourceId, eventType) → config
    └────────────┬────────────┘
                 ▼
     ◆ 5. Validar (opcional)  ◆────── Fallo ──▶ [RECHAZAR 422]
                 │
               Pasa
                 ▼
     ◆ 6. Verif. Dedup ◆──────────── Si ──▶ [Devolver ID existente]
                 │
                 No
                 ▼
    ┌─────────────────────────┐
    │  7. Normalizar (Mapeo)   │  ◄── Motor de mapeo en ejecucion
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  8. Enriquecer Metadatos │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │ 9. Persistir en PostgreSQL│
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │10. Publicar y ACK / 202  │
    └─────────────────────────┘
```

---

## 5. Topologia de RabbitMQ

### Exchanges

| Exchange | Tipo | Proposito | Durable |
|---|---|---|---|
| `events.incoming` | Topic | Recibe eventos crudos de sistemas fuente | Si |
| `events.normalized` | Topic | Publica eventos canonicos normalizados con claves de enrutamiento por nivel de prioridad | Si |
| `notifications.dlq` | Fanout | Exchange de mensajes muertos para mensajes fallidos | Si |
| `config.events` | Topic | Publica eventos de cambio de configuracion de mapeo (usado cuando `MAPPING_CACHE_ENABLED=true`) | Si |

### Colas

| Cola | Vinculada a | Clave de Enrutamiento | Concurrencia | Prefetch | DLQ |
|---|---|---|---|---|---|
| `q.events.amqp` | `events.incoming` | `source.*.#` | 3 | 10 | Si |
| `q.events.webhook` | `events.incoming` | `source.webhook.#` | 2 | 10 | Si |
| `q.events.email-ingest` | `events.incoming` | `source.email-ingest.#` | 2 | 10 | Si |
| `q.config.mapping-cache` | `config.events` | `config.mapping.changed` | 1 | 1 | No |

### Formato de Clave de Enrutamiento

**Los eventos entrantes** siguen el patron `source.{sourceId}.{eventType}`, donde `sourceId` identifica al sistema fuente registrado y `eventType` usa notacion de puntos para el evento de negocio (ej., `source.erp-system-1.order.shipped`). La cola `q.events.amqp` usa `source.*.#` para consumir todos los eventos de todas las fuentes AMQP. La cola `q.events.email-ingest` esta dedicada al Servicio de Ingesta de Email para aislamiento operativo.

**Los eventos normalizados** se publican en el exchange `events.normalized` con clave de enrutamiento `event.{priority}.{eventType}` (ej., `event.critical.order.delayed` o `event.normal.order.shipped`). El nivel de prioridad se determina por el campo `priority` en la configuracion de mapeo de eventos (por defecto: `normal`). Los consumidores downstream se vinculan a colas especificas por prioridad para procesamiento diferenciado — ver [02 — Microservicios Detallados](02-detailed-microservices.md) para la topologia de colas del Motor de Notificaciones y el Enrutador de Canales.

### Figura 5.1 — Topologia de RabbitMQ

```
                    ┌──────────────────┐
                    │  events.incoming  │
                    │  (Topic Exchange) │
                    └──┬──────┬──────┬─┘
                       │      │      │
        ┌──────────────┘      │      └──────────────┐
        ▼                     ▼                      ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  q.events.amqp   │ │ q.events.webhook │ │q.events.email-   │
│  source.*.#      │ │ source.webhook.# │ │    ingest         │
│(todas fuentes AMQP)│ │(eventos webhook)│ │source.email-      │
└────────┬─────────┘ └────────┬─────────┘ │  ingest.#         │
         │                    │           └────────┬──────────┘
         └────────────────────┴────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Ingesta de Eventos  │
                   │ Consumidores+Pipeline│
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐       ┌─────────────────┐
                   │ events.normalized   │       │ notifications.  │
                   │ (Topic Exchange)    │       │ dlq (DLQ)       │
                   │                     │       └─────────────────┘
                   │ Claves enrutamiento:│
                   │ event.critical.{t}  │
                   │ event.normal.{t}    │
                   └─────────────────────┘
```

---

## 6. Endpoints de la API REST

### POST /webhooks/events

Recibe eventos de webhook de integraciones externas. Valida, normaliza usando la configuracion de mapeo en tiempo de ejecucion, y publica el evento de forma asincrona.

#### Cabeceras de Solicitud

| Cabecera | Requerida | Descripcion |
|---|---|---|
| `Content-Type` | Si | `application/json` |
| `X-API-Key` | Condicional | Clave API para autenticacion de fuente (configurada por fuente) |
| `X-Signature` | Condicional | Firma HMAC para fuentes que usan autenticacion HMAC |
| `Authorization` | Condicional | Token bearer para fuentes que usan autenticacion por token |
| `X-Request-ID` | No | ID de correlacion opcional; generado si no se proporciona |

#### Cuerpo de Solicitud

```json
{
  "sourceId": "erp-system-1",
  "cycleId": "CYC-2026-00451",
  "eventType": "ORDER_SHIPPED",
  "sourceEventId": "ERP-EVT-78901",
  "timestamp": "2026-02-20T10:15:30Z",
  "payload": {
    "order_reference": "ORD-2026-00451",
    "customer": {
      "id": "CUST-00451",
      "email": "jane.doe@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "phone": "+1234567890"
    },
    "line_items": [
      { "sku": "PROD-001", "name": "Audifonos Inalambricos", "qty": 1, "unit_price": 79.99 }
    ],
    "order_total": 79.99,
    "currency_code": "USD"
  }
}
```

#### Descripcion de Campos

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `sourceId` | string | Si | Identificador del sistema fuente registrado |
| `cycleId` | string | Si | Identificador del ciclo de negocio |
| `eventType` | string | Si | Tipo de evento — ya sea notacion de puntos canonica o nativo de la fuente (resuelto via `eventTypeMapping`) |
| `sourceEventId` | string | No | ID unico del evento del sistema fuente (usado para deduplicacion) |
| `timestamp` | string | No | Timestamp ISO-8601 de cuando ocurrio el evento; por defecto la hora actual |
| `payload` | object | Si | Datos del evento especificos de la fuente (normalizados via configuracion de mapeo en tiempo de ejecucion) |

#### Respuestas

| Estado | Descripcion | Cuerpo |
|---|---|---|
| `202 Accepted` | Evento aceptado para procesamiento | `{ "eventId": "uuid", "status": "accepted" }` |
| `200 OK` | Evento duplicado (ya procesado) | `{ "eventId": "existing-uuid", "status": "duplicate" }` |
| `400 Bad Request` | JSON malformado o campos requeridos faltantes | `{ "error": "...", "details": [...] }` |
| `401 Unauthorized` | Clave API, firma HMAC o token bearer invalido | `{ "error": "Fallo de autenticacion" }` |
| `422 Unprocessable Entity` | Mapeo no encontrado o validacion fallida | `{ "error": "...", "details": [...] }` |
| `429 Too Many Requests` | Limite de tasa excedido | `{ "error": "Limite de tasa excedido", "retryAfter": 1000 }` |
| `500 Internal Server Error` | Error inesperado del servidor | `{ "error": "Error interno del servidor" }` |

### Endpoints CRUD de Mapeo de Eventos

Estos endpoints se exponen a traves del Servicio de Administracion (puerto 3155) para gestionar configuraciones de mapeo en tiempo de ejecucion.

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/v1/event-mappings` | Listar mapeos (filtrar por `sourceId`, `eventType`, `isActive`) |
| POST | `/api/v1/event-mappings` | Crear una nueva configuracion de mapeo |
| GET | `/api/v1/event-mappings/:id` | Obtener detalle de mapeo por ID |
| PUT | `/api/v1/event-mappings/:id` | Actualizar una configuracion de mapeo |
| DELETE | `/api/v1/event-mappings/:id` | Eliminacion logica de una configuracion de mapeo |
| POST | `/api/v1/event-mappings/:id/test` | Probar un mapeo con un payload de ejemplo |

#### Probar Mapeo — POST /api/v1/event-mappings/:id/test

Acepta un payload de ejemplo de la fuente y devuelve el evento canonico resultante sin persistir ni publicar. Util para validar configuraciones de mapeo antes de activarlas.

**Solicitud:**

```json
{
  "samplePayload": {
    "order_reference": "TEST-001",
    "customer": { "id": "C-1", "email": "test@example.com", "first_name": "Test", "last_name": "Usuario" }
  }
}
```

**Respuesta (200 OK):**

```json
{
  "canonicalEvent": {
    "sourceId": "erp-system-1",
    "eventType": "order.shipped",
    "customerId": "C-1",
    "orderId": "ERP-TEST-001",
    "customerEmail": "test@example.com",
    "customerName": "Test Usuario"
  },
  "warnings": [],
  "missingRequiredFields": []
}
```

### GET /health

Endpoint de chequeo de salud. Devuelve el estado del servicio, conectividad de base de datos, salud de la conexion RabbitMQ, y profundidad de las colas de consumidores.

#### Respuesta (200 OK)

```json
{
  "status": "saludable",
  "uptime": 86400,
  "checks": {
    "database": { "status": "activo", "latencyMs": 2 },
    "rabbitmq": { "status": "activo", "latencyMs": 5 },
    "queues": {
      "q.events.amqp": { "depth": 14, "consumers": 3 },
      "q.events.webhook": { "depth": 5, "consumers": 2 },
      "q.events.email-ingest": { "depth": 0, "consumers": 2 }
    }
  }
}
```

### GET /events/:eventId

Endpoint interno — recupera un evento individual por su `eventId` canonico. Devuelve el registro completo del evento incluyendo payload crudo, payload normalizado, estado y metadatos.

### GET /events

Endpoint interno de listado/filtro — devuelve eventos paginados con filtros opcionales.

#### Parametros de Consulta

| Parametro | Tipo | Por defecto | Descripcion |
|---|---|---|---|
| `sourceId` | string | — | Filtrar por sistema fuente |
| `eventType` | string | — | Filtrar por tipo de evento |
| `status` | string | — | Filtrar por estado (`received`, `published`, `failed`) |
| `from` | ISO-8601 | — | Inicio del rango de fechas |
| `to` | ISO-8601 | — | Fin del rango de fechas |
| `page` | integer | 1 | Numero de pagina |
| `limit` | integer | 50 | Elementos por pagina (max 200) |

---

## 7. Esquema Canonico de Eventos

Todos los eventos — independientemente de la fuente — se normalizan a este formato canonico plano (v2.0) antes de publicarse en el exchange `events.normalized`. Esto garantiza que los consumidores downstream (Motor de Notificaciones, Servicio de Auditoria) trabajen con un esquema unico y predecible.

### Campos Requeridos (nivel superior)

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `eventId` | string (UUID v4) | Si | Identificador unico generado por el servicio de ingesta |
| `sourceId` | string | Si | Identificador del sistema fuente registrado |
| `cycleId` | string | Si | Identificador del ciclo de negocio |
| `eventType` | string | Si | Tipo de evento con notacion de puntos (ej., `order.shipped`) |
| `customerId` | string | Si | Identificador del cliente |
| `orderId` | string | Si | Identificador de la orden |
| `customerEmail` | string | Si | Direccion de correo electronico del cliente |
| `customerPhone` | string | Si | Numero de telefono del cliente (formato E.164) |
| `timestamp` | string (ISO-8601) | Si | Cuando ocurrio el evento de negocio (UTC) |
| `priority` | string | Si | Nivel de prioridad para procesamiento downstream: `normal` (por defecto) o `critical`. Determinado por el campo `priority` en la configuracion de mapeo de eventos. |

### Campos Opcionales (nivel superior)

| Campo | Tipo | Descripcion |
|---|---|---|
| `customerName` | string | Nombre completo del cliente |
| `items` | array | Arreglo de lineas de pedido |
| `totalAmount` | number | Monto total de la orden |
| `currency` | string | Codigo de moneda ISO-4217 |
| `additionalData` | object | Campos adicionales especificos de la fuente no cubiertos por el esquema canonico |

### Metadatos del Sistema (objeto `metadata`)

Auto-generados por el servicio de ingesta — no se rellenan desde datos de la fuente.

| Campo | Tipo | Descripcion |
|---|---|---|
| `correlationId` | string | ID de correlacion unico para rastrear el evento a traves del pipeline |
| `sourceEventId` | string | ID de evento original del sistema fuente (usado para deduplicacion) |
| `receivedAt` | string (ISO-8601) | Timestamp de cuando el evento fue recibido por el servicio de ingesta |
| `normalizedAt` | string (ISO-8601) | Timestamp de cuando se completo la normalizacion |
| `schemaVersion` | string | Version del esquema canonico (`"2.0"`) |
| `mappingConfigId` | string (UUID) | ID de la configuracion de `event_mappings` usada para normalizacion |

### Ejemplo Completo de Evento Canonico

```json
{
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sourceId": "erp-system-1",
  "cycleId": "CYC-2026-00451",
  "eventType": "order.shipped",
  "customerId": "CUST-00451",
  "orderId": "ERP-ORD-2026-00451",
  "customerEmail": "jane.doe@example.com",
  "customerPhone": "+1234567890",
  "timestamp": "2026-02-20T10:15:30.000Z",
  "priority": "critical",
  "customerName": "Jane Doe",
  "items": [
    {
      "sku": "PROD-001",
      "name": "Audifonos Inalambricos",
      "quantity": 1,
      "price": 79.99
    }
  ],
  "totalAmount": 79.99,
  "currency": "USD",
  "additionalData": {
    "trackingNumber": "794644790132",
    "carrier": "FedEx"
  },
  "metadata": {
    "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
    "sourceEventId": "ERP-EVT-78901",
    "receivedAt": "2026-02-20T10:15:30.123Z",
    "normalizedAt": "2026-02-20T10:15:30.456Z",
    "schemaVersion": "2.0",
    "mappingConfigId": "d4f8e2a1-3b5c-4d6e-8f9a-1b2c3d4e5f6a"
  }
}
```

---

## 8. Diseno de Base de Datos

- **Esquema:** `event_ingestion_service`
- **Usuario:** `event_ingestion_service_user`
- **Script de BD:** `event-ingestion-service/dbscripts/schema-event-ingestion-service.sql`

### Tabla events

Registro inmutable de todos los eventos ingestados. Cada fila almacena el payload original de la fuente y la salida canonica normalizada, junto con el estado de procesamiento y metadatos de trazabilidad (`event_id`, `correlation_id`, `cycle_id`). Esta es la **tabla de mayor crecimiento** en el esquema (~5 GB/mes, ~50 GB/anio), con una purga programada de payloads (`purge_event_payloads()`) que establece a NULL las columnas JSONB grandes despues de 90 dias mientras preserva metadatos del evento indefinidamente para auditoria y trazabilidad.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Clave subrogada auto-incremental |
| `event_id` | `UUID` | `NOT NULL UNIQUE DEFAULT gen_random_uuid()` | Identificador canonico del evento |
| `source_id` | `VARCHAR(50)` | `NOT NULL` | Identificador del sistema fuente registrado |
| `cycle_id` | `VARCHAR(255)` | `NOT NULL` | Identificador del ciclo de negocio |
| `event_type` | `VARCHAR(100)` | `NOT NULL` | Tipo de evento con notacion de puntos |
| `source_event_id` | `VARCHAR(255)` | | ID de evento original de la fuente |
| `raw_payload` | `JSONB` | `NOT NULL` | Payload original tal como se recibio |
| `normalized_payload` | `JSONB` | | Formato canonico despues de normalizacion |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'received'` | Estado de procesamiento |
| `error_message` | `TEXT` | | Detalles del error si el procesamiento fallo |
| `correlation_id` | `UUID` | | ID de correlacion para trazabilidad distribuida |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp de creacion del registro |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp de ultima actualizacion |

#### Indices

| Indice | Columnas | Tipo | Proposito |
|---|---|---|---|
| `idx_events_event_id` | `event_id` | UNIQUE | Busqueda rapida por ID canonico |
| `idx_events_source_source_event_id` | `source_id, source_event_id` | UNIQUE (parcial, WHERE source_event_id IS NOT NULL) | Clave compuesta de deduplicacion |
| `idx_events_source_type` | `source_id, event_type` | B-Tree | Filtrar por fuente y tipo |
| `idx_events_status` | `status` | B-Tree | Filtrar por estado de procesamiento |
| `idx_events_created_at` | `created_at` | B-Tree | Consultas por rango de tiempo |

#### Valores del Enum de Estado

| Estado | Descripcion |
|---|---|
| `received` | Evento recibido y persistido, esperando normalizacion |
| `validated` | Validacion del payload aprobada (si se configuro `validationSchema`) |
| `normalized` | Normalizacion completada |
| `published` | Publicado exitosamente en el exchange `events.normalized` |
| `failed` | Procesamiento fallido (ver `error_message`) |
| `duplicate` | Identificado como duplicado, no se reproceso |

### Tabla event_sources

Registro de sistemas fuente externos autorizados. Cada fila representa un punto de integracion registrado — ya sea un consumidor RabbitMQ o un endpoint de webhook — con sus credenciales de autenticacion (claves API y secretos de firma hasheados), configuracion de conexion y limitacion de tasa opcional por fuente. Esta es una tabla de referencia de bajo volumen (~decenas de filas) que se consulta en cada evento entrante para validar la fuente y aplicar limites de tasa.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Clave subrogada auto-incremental |
| `name` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Identificador del sistema fuente (usado como `sourceId`) |
| `display_name` | `VARCHAR(100)` | `NOT NULL` | Nombre legible |
| `type` | `VARCHAR(20)` | `NOT NULL` | Tipo de integracion (`rabbitmq`, `webhook`) |
| `connection_config` | `JSONB` | | Configuracion de conexion (nombres de colas, claves de enrutamiento) |
| `api_key_hash` | `VARCHAR(128)` | | Hash SHA-256 de la clave API (fuentes webhook) |
| `signing_secret_hash` | `VARCHAR(128)` | | Hash SHA-256 del secreto de firma (fuentes HMAC) |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Si la fuente esta activa |
| `rate_limit` | `INTEGER` | | Max eventos por segundo (null = ilimitado) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp de creacion del registro |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp de ultima actualizacion |

### Tabla event_mappings

Reglas de mapeo de campos configuradas por el administrador que definen como se transforman los payloads de eventos especificos de la fuente al formato canonico plano de eventos. Cada mapeo esta identificado por `(source_id, event_type)` y especifica rutas de extraccion de campos, funciones de transformacion (13 tipos incluyendo `direct`, `concatenate`, `template`, `dateFormat`, etc.), normalizacion de timestamps, validacion opcional con JSON Schema, y nivel de prioridad (`normal`/`critical`). Esta es una tabla de configuracion de bajo volumen (~100-500 filas) que se accede en cada evento durante la normalizacion — un cache eager opcional con invalidacion dirigida por eventos puede habilitarse para despliegues de alto rendimiento.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador de configuracion de mapeo |
| `source_id` | `VARCHAR(50)` | `NOT NULL` | Identificador del sistema fuente registrado |
| `event_type` | `VARCHAR(100)` | `NOT NULL` | Tipo de evento canonico (o `*` para comodin) |
| `name` | `VARCHAR(255)` | `NOT NULL` | Nombre legible del mapeo |
| `description` | `TEXT` | | Descripcion del proposito del mapeo |
| `field_mappings` | `JSONB` | `NOT NULL` | Reglas de extraccion y transformacion de campos |
| `event_type_mapping` | `JSONB` | | Tipos de evento fuente → tipos de evento canonicos |
| `timestamp_field` | `VARCHAR(255)` | | Ruta con puntos al timestamp en el payload fuente |
| `timestamp_format` | `VARCHAR(50)` | `DEFAULT 'iso8601'` | Formato del timestamp |
| `source_event_id_field` | `VARCHAR(255)` | | Ruta con puntos al ID de deduplicacion fuente |
| `validation_schema` | `JSONB` | | JSON Schema opcional para validacion del payload entrante |
| `priority` | `VARCHAR(10)` | `NOT NULL DEFAULT 'normal'` | Nivel de prioridad del evento: `normal` o `critical` |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Si este mapeo esta activo |
| `version` | `INTEGER` | `NOT NULL DEFAULT 1` | Version de configuracion |
| `created_by` | `VARCHAR(100)` | | Usuario que creo el mapeo |
| `updated_by` | `VARCHAR(100)` | | Usuario que actualizo el mapeo por ultima vez |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp de creacion del registro |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp de ultima actualizacion |

**Restriccion unica:** `(source_id, event_type) WHERE is_active = true` — asegura solo un mapeo activo por par fuente+tipo.

### Figura 8.1 — Diagrama Entidad-Relacion

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│         event_sources        │       │        event_mappings        │
├──────────────────────────────┤       ├──────────────────────────────┤
│ PK  id          SERIAL       │       │ PK  id          UUID         │
│     name        VARCHAR(50)  │       │     source_id   VARCHAR(50)  │
│     display_name VARCHAR(100)│       │     event_type  VARCHAR(100) │
│     type        VARCHAR(20)  │       │     name        VARCHAR(255) │
│     connection_config JSONB  │       │     field_mappings JSONB     │
│     api_key_hash VARCHAR(128)│       │     event_type_mapping JSONB │
│     signing_secret_hash      │       │     timestamp_field          │
│     is_active   BOOLEAN      │       │     validation_schema JSONB  │
│     rate_limit  INTEGER      │       │     is_active   BOOLEAN      │
│     created_at  TIMESTAMPTZ  │       │     version     INTEGER      │
└──────────────┬───────────────┘       │     created_at  TIMESTAMPTZ  │
               │                       │     updated_at  TIMESTAMPTZ  │
               │ source_id (name)      └──────────────┬───────────────┘
               │                                      │
               │                                      │ source_id + event_type
               ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                             events                                  │
├─────────────────────────────────────────────────────────────────────┤
│ PK  id                 BIGSERIAL                                    │
│ UK  event_id           UUID                                         │
│     source_id          VARCHAR(50)      ◄── FK a event_sources      │
│     cycle_id           VARCHAR(255)                                  │
│     event_type         VARCHAR(100)     ◄── busqueda en event_mappings│
│     source_event_id    VARCHAR(255)                                  │
│     raw_payload        JSONB                                         │
│     normalized_payload JSONB                                         │
│     status             VARCHAR(20)                                   │
│     error_message      TEXT                                          │
│     correlation_id     UUID                                          │
│     created_at         TIMESTAMPTZ                                   │
│     updated_at         TIMESTAMPTZ                                   │
├─────────────────────────────────────────────────────────────────────┤
│ UK  (source_id, source_event_id) WHERE source_event_id IS NOT NULL  │
└─────────────────────────────────────────────────────────────────────┘
```

### Retencion de Datos

La tabla `events` es la tabla de mayor crecimiento en la plataforma (~5 GB/mes, ~50 GB/anio). Una purga programada de payloads recupera almacenamiento de payloads JSONB grandes mientras preserva metadatos de eventos para auditoria y depuracion.

#### Purga de Payloads

Despues de 90 dias (configurable), las columnas `raw_payload` y `normalized_payload` se establecen a `NULL`. La fila del evento en si — incluyendo `event_id`, `source_id`, `event_type`, `status`, `correlation_id` y timestamps — se retiene indefinidamente para auditoria y trazabilidad.

#### Funcion de Purga

`event_ingestion_service.purge_event_payloads()` es una funcion PL/pgSQL que realiza la purga:

| Parametro | Por defecto | Descripcion |
|---|---|---|
| `p_older_than_days` | 90 | Establece a NULL `raw_payload` y `normalized_payload` en filas mas antiguas que este valor |

**Uso:**

```sql
-- Ejecutar con valor por defecto (90 dias)
SELECT event_ingestion_service.purge_event_payloads();

-- Periodo de retencion personalizado
SELECT event_ingestion_service.purge_event_payloads(60);
```

**Devuelve** un resumen JSONB:

```json
{
  "purged_rows": 142857,
  "cutoff": "2025-11-22T02:00:00.000Z",
  "executed_at": "2026-02-20T02:00:00.000Z"
}
```

**Programacion:** La funcion esta disenada para ser llamada por `pg_cron` (ej., diariamente a las 02:00 UTC), un programador a nivel de aplicacion, o manualmente durante ventanas de mantenimiento.

---

## 9. Validacion de Eventos

### Flujo de Validacion

La validacion es opcional y esta dirigida por la configuracion de mapeo. Si una fila de `event_mappings` incluye un `validationSchema` (JSON Schema), el payload entrante se valida antes de la normalizacion. Esto reemplaza el enfoque anterior de registro de esquemas — los esquemas de validacion ahora se almacenan en linea en la configuracion de mapeo.

1. **Buscar mapeo** para `(sourceId, eventType)` (realizado en el paso 4 del pipeline).
2. **Verificar `validationSchema`:** Si el mapeo tiene un campo `validationSchema`, proceder a la validacion. Si no, saltar a la verificacion de deduplicacion.
3. **Validar** el payload crudo contra el JSON Schema usando `ajv` (Another JSON Validator).
4. **Pasa:** Proceder a deduplicacion y normalizacion.
5. **Falla:** Rechazar con `422 Unprocessable Entity` incluyendo todos los detalles de violacion.

### Ejemplo de Esquema de Validacion (en configuracion de mapeo)

```json
{
  "validationSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["order_reference", "customer"],
    "properties": {
      "order_reference": { "type": "string", "minLength": 1 },
      "customer": {
        "type": "object",
        "required": ["email", "id"],
        "properties": {
          "email": { "type": "string", "format": "email" },
          "id": { "type": "string", "minLength": 1 },
          "phone": { "type": "string", "pattern": "^\\+[1-9]\\d{1,14}$" }
        }
      },
      "line_items": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["sku", "name", "qty", "unit_price"],
          "properties": {
            "sku": { "type": "string" },
            "name": { "type": "string" },
            "qty": { "type": "integer", "minimum": 1 },
            "unit_price": { "type": "number", "minimum": 0 }
          }
        }
      }
    }
  }
}
```

> **Info:** **Validacion en Linea:** Los esquemas de validacion se almacenan directamente en la tabla `event_mappings` junto con los mapeos de campos, consolidando mapeo + validacion en una sola configuracion por `(sourceId, eventType)`. Las actualizaciones surten efecto inmediatamente en la siguiente consulta a la base de datos (modo por defecto), o dentro de ~100ms cuando el cache eager esta habilitado (`MAPPING_CACHE_ENABLED=true`) via invalidacion dirigida por eventos.

> **Advertencia:** **Validacion Estricta vs. Permisiva:** A diferencia de un registro de esquemas global, la rigurosidad de la validacion ahora es por mapeo. Algunos mapeos pueden usar `"additionalProperties": false` para validacion estricta, mientras que otros pueden omitir la validacion por completo si la fuente es confiable. Elija el nivel apropiado por sistema fuente.

---

## 10. Idempotencia y Deduplicacion

### Estrategia de Deduplicacion

El Servicio de Ingesta de Eventos previene el procesamiento duplicado de eventos usando una estrategia de clave compuesta:

- **Clave Compuesta:** `(source_id, source_event_id)` — unica por sistema fuente dentro de la ventana de deduplicacion.
- **Extraccion del ID de Evento Fuente:** El `sourceEventIdField` en la configuracion de mapeo define la ruta con puntos al ID de deduplicacion en el payload fuente. Para eventos de webhook, el campo `sourceEventId` del cuerpo de la solicitud se usa directamente si esta presente.
- **Ventana de Deduplicacion:** Configurable via `DEDUP_WINDOW_HOURS` (por defecto: 24 horas).
- **Mecanismo:** `INSERT ... ON CONFLICT (source_id, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`.
- **Resultado:** Si la insercion tiene exito, el evento es nuevo. Si entra en conflicto, se devuelve el ID de evento existente.

### Figura 10.1 — Flujo de Verificacion de Idempotencia

```
                 ┌──────────────────────┐
                 │   Evento Entrante     │
                 └──────────┬───────────┘
                            ▼
                ◆ sourceEventId presente? ◆
                   │                │
                  Si               No
                   │                │
                   ▼                ▼
        ◆ Existe en BD dentro ◆   Generar nuevo eventId
        ◆ de ventana dedup?   ◆   Proceder a normalizar
                   │                │
                  Si               │
                   │                │
                   ▼                │
          Devolver eventId          │
          existente (200 OK)        │
                                    │
                  No ◄──────────────┘
                   │
                   ▼
          INSERTAR nuevo evento
          Proceder a normalizar
```

### Casos Limite

| Escenario | Comportamiento |
|---|---|
| **sourceEventId faltante** | El evento siempre se trata como nuevo — sin verificacion de deduplicacion. Se genera un nuevo `eventId`. |
| **Mismo sourceEventId, diferente sourceId** | Se tratan como eventos separados — la clave compuesta incluye el `sourceId`. |
| **Mismo evento dentro de ventana de dedup** | Devuelve `200 OK` con el `eventId` existente y `"status": "duplicate"`. |
| **Mismo evento despues de ventana de dedup** | Se trata como un evento nuevo — el registro original puede haber sido archivado. |
| **Duplicados concurrentes** | El `ON CONFLICT` de PostgreSQL maneja condiciones de carrera de forma atomica. |

---

## 11. Diagramas de Secuencia

### 11.1 Flujo de Webhook

```
Sistema Fuente        Gateway           Ingesta de Eventos       PostgreSQL / RabbitMQ
     │                    │                     │                         │
     │  HTTP POST         │                     │                         │
     │  /webhooks/events  │                     │                         │
     │───────────────────▶│                     │                         │
     │                    │  Validar auth       │                         │
     │                    │  (por fuente)       │                         │
     │                    │────────────────────▶│                         │
     │                    │                     │  Buscar mapeo           │
     │                    │                     │────────────────────────▶│
     │                    │                     │  Config de mapeo        │
     │                    │                     │◄────────────────────────│
     │                    │                     │  Validar (opcional)     │
     │                    │                     │  Verificar dedup        │
     │                    │                     │────────────────────────▶│
     │                    │                     │  Resultado dedup        │
     │                    │                     │◄────────────────────────│
     │                    │                     │  Normalizar (mapeo)     │
     │                    │                     │                         │
     │                    │                     │  INSERT evento          │
     │                    │                     │────────────────────────▶│
     │                    │                     │  Confirmar              │
     │                    │                     │◄────────────────────────│
     │                    │                     │  Publicar en            │
     │                    │                     │  events.normalized      │
     │                    │                     │────────────────────────▶│
     │                    │  202 Accepted        │                         │
     │                    │◄────────────────────│                         │
     │  202 Accepted      │                     │                         │
     │◄───────────────────│                     │                         │
```

### 11.2 Flujo de Consumidor RabbitMQ

```
Sistema Fuente   events.incoming      Consumidor         PostgreSQL / events.normalized
     │              Exchange              │                         │
     │                 │                  │                         │
     │  Publicar msg   │                  │                         │
     │  source.{id}.*  │                  │                         │
     │────────────────▶│                  │                         │
     │                 │  Entregar a       │                         │
     │                 │  q.events.amqp   │                         │
     │                 │─────────────────▶│                         │
     │                 │                  │  Buscar mapeo           │
     │                 │                  │────────────────────────▶│
     │                 │                  │  Config de mapeo        │
     │                 │                  │◄────────────────────────│
     │                 │                  │  Validar (opcional)     │
     │                 │                  │  Verificar dedup        │
     │                 │                  │────────────────────────▶│
     │                 │                  │  Resultado dedup        │
     │                 │                  │◄────────────────────────│
     │                 │                  │  Normalizar (mapeo)     │
     │                 │                  │  INSERT evento          │
     │                 │                  │────────────────────────▶│
     │                 │                  │  Publicar en normalized │
     │                 │                  │────────────────────────▶│
     │                 │  ACK mensaje     │                         │
     │                 │◄─────────────────│                         │
     │                 │                  │                         │
     │                 │    ┌─────────────────────────────┐         │
     │                 │    │ ALT: Fallo                   │         │
     │                 │    │  NACK → DLQ tras 3 reintentos│         │
     │                 │    └─────────────────────────────┘         │
```

---

## 12. Manejo de Errores y Colas de Mensajes Muertos

### Categorias de Error

| Categoria | Estado HTTP | Manejo | Reintento |
|---|---|---|---|
| **Error de Validacion** | 422 | Rechazar con detalles de violacion, registrar advertencia | No |
| **Mapeo No Encontrado** | 422 | Rechazar — sin config de mapeo para `(sourceId, eventType)` | No |
| **Evento Duplicado** | 200 | Devolver eventId existente, sin procesamiento | No |
| **Fallo de Autenticacion** | 401 | Rechazar, registrar advertencia de seguridad | No |
| **Error Transitorio de BD** | 500 | Reintentar con backoff exponencial | Si (3x) |
| **Error Transitorio RabbitMQ** | 500 | NACK + reencolar, reintentar con backoff | Si (3x) |
| **Error de Normalizacion** | 500 | Registrar error, marcar evento como fallido | No |

### Estrategia de Cola de Mensajes Muertos

- **Exchange DLQ:** `notifications.dlq` (fanout)
- **Configuracion:** Todas las colas fuente declaran `x-dead-letter-exchange: notifications.dlq`
- **Activador:** Los mensajes se envian a la cola de muertos despues de 3 intentos de entrega fallidos (rastreados via cabeceras `x-death`)
- **Cabeceras `x-death`:** RabbitMQ automaticamente agrega cabeceras `x-death` con conteo de fallos, razon, exchange original y clave de enrutamiento

### Configuracion de Reintentos

| Parametro | Valor | Descripcion |
|---|---|---|
| `maxRetries` | 3 | Maximo de intentos de reintento antes de enviar a cola de muertos |
| `initialDelay` | 1000 ms | Retraso del primer reintento |
| `backoffMultiplier` | 2x | Multiplicador de backoff exponencial |
| `maxDelay` | 30,000 ms | Retraso maximo entre reintentos |

> **Advertencia:** **Mensajes Venenosos:** Los mensajes que fallan consistentemente en el procesamiento (ej., cabeceras malformadas, payloads corruptos) seran enviados a la cola de muertos despues de 3 intentos. La DLQ debe ser monitoreada y los mensajes muertos investigados manualmente. Se puede agregar un consumidor DLQ dedicado para alertar a los equipos de operaciones y proporcionar triaje automatizado.

---

## 13. Monitoreo y Chequeos de Salud

### Metricas Clave

| Metrica | Descripcion | Umbral de Alerta |
|---|---|---|
| `event_ingestion_received_total` | Total de eventos recibidos (por sourceId) | — |
| `event_ingestion_published_total` | Total de eventos publicados al exchange normalizado | — |
| `event_ingestion_failed_total` | Total de eventos que fallaron en procesamiento | > 10/min |
| `event_ingestion_duplicate_total` | Total de eventos duplicados detectados | — |
| `event_ingestion_validation_errors_total` | Total de fallos de validacion (por sourceId) | > 50/min |
| `event_ingestion_mapping_not_found_total` | Total de rechazos por mapeo no encontrado | > 5/min |
| `event_ingestion_processing_duration_ms` | Latencia de procesamiento de eventos (p50, p95, p99) | p99 > 500ms |
| `event_ingestion_queue_depth` | Profundidad actual de cola por cola | > 1000 |
| `event_ingestion_consumer_lag` | Retraso del consumidor (mensajes pendientes) | > 5000 |
| `event_ingestion_dlq_depth` | Profundidad de la cola de mensajes muertos | > 0 |
| `event_ingestion_service_pool_active` | Conexiones activas a base de datos | > 80% del pool |
| `event_ingestion_mapping_cache_hit_rate` | Tasa de acierto del cache de config de mapeo (cuando `MAPPING_CACHE_ENABLED=true`) | < 80% |
| `event_ingestion_mapping_cache_invalidations_total` | Total de eventos de invalidacion de cache recibidos | — |

### Registro Estructurado

Todas las entradas de log usan formato JSON estructurado con los siguientes campos estandar:

```json
{
  "timestamp": "2026-02-20T10:15:30.123Z",
  "level": "info",
  "service": "event-ingestion-service",
  "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sourceId": "erp-system-1",
  "eventType": "order.shipped",
  "message": "Evento normalizado y publicado exitosamente",
  "durationMs": 45
}
```

> **Info:** **Prometheus + Grafana:** Todas las metricas se exponen via un endpoint `/metrics` en formato Prometheus. Un dashboard de Grafana preconfigurado proporciona visibilidad en tiempo real del rendimiento de eventos, latencia de procesamiento, tasas de error, profundidad de colas y salud de los consumidores. Las alertas estan configuradas en Grafana para umbrales criticos.

---

## 14. Configuracion

### Variables de Entorno

| Variable | Por defecto | Descripcion |
|---|---|---|
| `PORT` | `3151` | Puerto del servidor HTTP |
| `DATABASE_URL` | — | Cadena de conexion PostgreSQL |
| `RABBITMQ_URL` | — | Cadena de conexion RabbitMQ (AMQP) |
| `RABBITMQ_PREFETCH` | `10` | Conteo de prefetch por consumidor |
| `DEDUP_WINDOW_HOURS` | `24` | Ventana de deduplicacion en horas |
| `WEBHOOK_RATE_LIMIT` | `100` | Max solicitudes de webhook por segundo (por defecto global) |
| `LOG_LEVEL` | `info` | Nivel de registro (`debug`, `info`, `warn`, `error`) |
| `MAPPING_CACHE_ENABLED` | `false` | Habilitar cache eager de mapeo con invalidacion dirigida por eventos via RabbitMQ. Cuando es `false`, cada busqueda de mapeo consulta PostgreSQL directamente. |
| `DLQ_MAX_RETRIES` | `3` | Maximo de reintentos antes de enviar a cola de muertos |
| `RETRY_INITIAL_DELAY_MS` | `1000` | Retraso inicial de reintento en milisegundos |
| `RETRY_BACKOFF_MULTIPLIER` | `2` | Multiplicador de backoff exponencial |
| `RETRY_MAX_DELAY_MS` | `30000` | Retraso maximo de reintento en milisegundos |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Intervalo de sondeo de chequeo de salud |

---

*Documentacion de Notification API v2.0 -- Equipo de Arquitectura -- 2026*
