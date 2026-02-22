# 08 — Servicio de Motor de Notificaciones

**Notification API — Profundizacion en el Motor de Notificaciones**

| | |
|---|---|
| **Version:** | 1.0 |
| **Fecha:** | 2026-02-20 |
| **Autor:** | Equipo de Arquitectura |
| **Estado:** | **[En Revision]** |

---

## Tabla de Contenidos

1. [Descripcion General del Servicio](#1-descripcion-general-del-servicio)
2. [Arquitectura y Puntos de Integracion](#2-arquitectura-y-puntos-de-integracion)
3. [Pipeline de Procesamiento de Eventos](#3-pipeline-de-procesamiento-de-eventos)
4. [Motor de Reglas](#4-motor-de-reglas)
5. [Resolucion de Destinatarios](#5-resolucion-de-destinatarios)
6. [Supresion y Deduplicacion](#6-supresion-y-deduplicacion)
7. [Coordinacion de Renderizado de Plantillas](#7-coordinacion-de-renderizado-de-plantillas)
8. [Despacho de Notificaciones](#8-despacho-de-notificaciones)
9. [Gestion de Prioridad](#9-gestion-de-prioridad)
10. [Topologia de RabbitMQ](#10-topologia-de-rabbitmq)
11. [Endpoints de la API REST](#11-endpoints-de-la-api-rest)
12. [Diseno de Base de Datos](#12-diseno-de-base-de-datos)
13. [Maquina de Estados del Ciclo de Vida de Notificaciones](#13-maquina-de-estados-del-ciclo-de-vida-de-notificaciones)
14. [Diagramas de Secuencia](#14-diagramas-de-secuencia)
15. [Rendimiento y Escalabilidad](#15-rendimiento-y-escalabilidad)
16. [Manejo de Errores y Colas de Mensajes Muertos](#16-manejo-de-errores-y-colas-de-mensajes-muertos)
17. [Monitoreo y Chequeos de Salud](#17-monitoreo-y-chequeos-de-salud)
18. [Configuracion](#18-configuracion)

---

## 1. Descripcion General del Servicio

El Servicio de Motor de Notificaciones es el orquestador central de la plataforma — el "cerebro" que determina que notificaciones enviar, a quien, usando que plantillas y a traves de que canales. Consume eventos normalizados del Servicio de Ingesta de Eventos via RabbitMQ, los evalua contra un motor de reglas configurable, resuelve listas de destinatarios, coordina el renderizado de plantillas con el Servicio de Plantillas, y despacha las notificaciones renderizadas al Enrutador de Canales para su entrega. Tambien gestiona el ciclo de vida de las notificaciones, rastreando cada notificacion desde su creacion hasta la entrega o fallo.

| Atributo | Valor |
|---|---|
| **Tecnologia** | NestJS (TypeScript) con consumidores RabbitMQ (`@golevelup/nestjs-rabbitmq`) |
| **Puerto** | `3152` |
| **Esquema** | PostgreSQL — `notification_engine_service` |
| **Dependencias** | Ingesta de Eventos (via RabbitMQ), Servicio de Plantillas (HTTP), Enrutador de Canales (via RabbitMQ), Servicio de Auditoria (via RabbitMQ), PostgreSQL |
| **Carpeta en Repositorio** | `notification-engine-service/` |

### Responsabilidades

1. **Consumo de Eventos:** Se suscribe al exchange `xch.events.normalized` mediante colas con prioridad por niveles (`q.engine.events.critical` y `q.engine.events.normal`) y procesa cada evento normalizado a traves del pipeline de evaluacion de reglas.
2. **Coincidencia de Reglas:** Evalua cada evento contra todas las reglas de notificacion activas usando un sistema declarativo basado en condiciones. Soporta operadores de igualdad, rango, lista y existencia contra campos planos del evento.
3. **Resolucion de Destinatarios:** Determina los destinatarios de notificaciones basandose en el `recipientType` de la regla — cliente (de campos del evento), grupo (de la tabla `recipient_groups`), o personalizado (lista explicita en la configuracion de la regla).
4. **Supresion y Deduplicacion:** Evalua politicas opcionales de supresion por regla (ventanas de deduplicacion, periodos de enfriamiento, conteos maximos de envio) despues de la resolucion de destinatarios para prevenir notificaciones duplicadas o excesivas.
5. **Coordinacion de Renderizado de Plantillas:** Llama al Servicio de Plantillas (HTTP) para renderizar la plantilla apropiada para cada canal, pasando el payload plano del evento como datos de variables.
6. **Despacho al Enrutador de Canales:** Publica notificaciones renderizadas al exchange `xch.notifications.deliver` con claves de enrutamiento especificas por prioridad y canal.
7. **Gestion del Ciclo de Vida:** Rastrea cada notificacion a traves de sus estados de ciclo de vida: **PENDING** → **PROCESSING** → **RENDERING** → **DELIVERING** → **SENT** → **DELIVERED** o **FAILED** (con **SUPPRESSED** como estado terminal temprano).
8. **Preferencias de Canal del Cliente y Anulaciones Criticas:** Resuelve preferencias de canal de opt-in/opt-out por cliente (identificadas por `customer_id`) y evalua reglas configurables de anulacion critica de canal (identificadas por `event_type`). Las preferencias del cliente se gestionan via endpoints de webhook para integracion con sistemas externos; las anulaciones criticas fuerzan canales especificos independientemente de las preferencias. Ambas se almacenan en cache para rendimiento — las preferencias usan cache read-through basado en TTL (LRU), las anulaciones usan cache eager en memoria con invalidacion dirigida por eventos.
9. **Gestion de Prioridad:** Hereda el nivel de prioridad del evento originante; las reglas pueden anular con `deliveryPriority`. La prioridad efectiva determina el enrutamiento de colas para el procesamiento posterior.
10. **Registro Asincrono de Estado:** Todas las transiciones de estado de notificaciones se publican en RabbitMQ como mensajes fire-and-forget — el consumidor del registro de estado las persiste asincronamente para evitar bloquear la ruta critica de procesamiento de notificaciones.

> **Info:** **Arquitectura Desacoplada Basada en Reglas**
>
> El enfoque basado en reglas desacopla completamente a los productores de eventos de la logica de notificaciones. Los sistemas fuente publican eventos sin ningun conocimiento de que notificaciones se activaran. El equipo operativo puede crear, modificar, habilitar o deshabilitar reglas de notificacion en cualquier momento a traves de la UI de Administracion sin requerir cambios de codigo ni despliegues.

---

## 2. Arquitectura y Puntos de Integracion

El Motor de Notificaciones se ubica en el centro del pipeline de notificaciones — entre el Servicio de Ingesta de Eventos (upstream) y el Enrutador de Canales (downstream). Es el unico servicio que coordina llamadas HTTP sincronas al Servicio de Plantillas mientras participa simultaneamente en el backbone de mensajeria asincrona de RabbitMQ.

### Dependencias Upstream y Downstream

| Direccion | Sistema | Protocolo | Descripcion |
|---|---|---|---|
| **Upstream** | Servicio de Ingesta de Eventos | RabbitMQ (AMQP) | Consume eventos normalizados del exchange `xch.events.normalized` via colas con prioridad por niveles |
| **Downstream** | Servicio de Plantillas | HTTP/REST (sincrono) | Llama a `POST /templates/:id/render` para renderizar plantilla por canal con el payload del evento como datos de variables |
| **Downstream** | Enrutador de Canales | RabbitMQ (AMQP) | Publica notificaciones renderizadas al exchange `xch.notifications.deliver` con clave de enrutamiento `notification.deliver.{priority}.{channel}` |
| **Downstream** | Servicio de Auditoria | RabbitMQ (AMQP) | Publica transiciones de estado de notificaciones al exchange `xch.notifications.status` (fire-and-forget) |
| **Entrante** | Servicio de Administracion | HTTP/REST (sincrono) | Recibe operaciones CRUD de reglas, consultas de notificaciones y solicitudes de datos del dashboard proxy a traves del Gateway |
| **Entrante** | Enrutador de Canales | RabbitMQ (AMQP) | Recibe actualizaciones de estado de entrega (SENT, DELIVERED, FAILED) del exchange `xch.notifications.status` para actualizar registros de notificaciones |

### Figura 2.1 — Contexto de Integracion

```
                                                    ┌──────────────────────┐
                                                    │   Servicio de        │
                                                    │   Plantillas :3153   │
                                                    │   Renderizar         │
                                                    │   plantillas         │
                                                    └──────────┬───────────┘
                                                               ▲
                                                               │ HTTP POST
                                                               │ /templates/:id/render
                                                               │
┌──────────────────────────┐      ┌─────────────────────────────────────────────────────┐      ┌───────────────────────────┐
│ xch.events.normalized    │      │         Servicio de Motor de Notificaciones         │      │ xch.notifications.deliver │
│ (Exchange de Topico)     │─────▶│            :3152                                    │─────▶│ (Exchange de Topico)      │
│                          │      │                                                     │      │                           │
│ q.engine.events.         │      │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │      │ q.deliver.{channel}.      │
│   critical (4 cons)      │      │  │  Motor   │  │Resolucion│  │  Verificacion   │  │      │   {priority}              │
│ q.engine.events.         │      │  │  de      │→│de Destin.│→│  de Supresion   │  │      │                           │
│   normal (2 cons)        │      │  │  Reglas  │  └──────────┘  └──────────────────┘  │      └─────────────┬─────────────┘
└──────────────────────────┘      │  └──────────┘                                      │                  │
                              │  PostgreSQL: notification_engine_service             │                  ▼
                              └─────────────────────────────────────────────────────┘      ┌───────────────────────┐
                                           │                                              │   Enrutador de        │
                                           │ Transiciones de estado                       │   Canales :3154       │
                                           ▼                                              │   Enrutar y Entregar  │
                              ┌───────────────────────────┐                              └───────────────────────┘
                              │ xch.notifications.status  │
                              │ (Exchange de Topico)      │
                              │                           │──────────────────────▶ Servicio de Auditoria :3156
                              └───────────────────────────┘

                              ┌─────────────────────────┐
                              │ Servicio de Admin :3155  │──── HTTP/REST ────▶ Motor de Notificaciones :3152
                              │ (via Gateway :3150)      │                    (CRUD de reglas, consultas de notificaciones)
                              └─────────────────────────┘
```

---

## 3. Pipeline de Procesamiento de Eventos

Cada evento normalizado consumido del exchange `xch.events.normalized` pasa por un pipeline de procesamiento de 9 pasos. Este pipeline se ejecuta por evento y puede producir cero, una o muchas notificaciones dependiendo de cuantas reglas coincidan y cuantos destinatarios resuelva cada regla.

1. **Consumir Evento:** Recibir evento normalizado de la cola de RabbitMQ con prioridad por niveles (`q.engine.events.critical` o `q.engine.events.normal`).
2. **Busqueda de Reglas:** Consultar todas las reglas de notificacion activas cuyo `eventType` coincida con el tipo de evento entrante. Por defecto, las reglas se obtienen directamente de PostgreSQL. Cuando `RULE_CACHE_ENABLED=true`, las reglas se resuelven desde un cache en memoria con invalidacion dirigida por eventos (ver [Seccion 4.3 — Estrategia de Cache de Reglas](#43-estrategia-de-cache-de-reglas)).
3. **Evaluar Condiciones:** Para cada regla coincidente, evaluar el objeto `conditions` contra los campos planos del evento usando el evaluador de expresiones. Las reglas que pasan todas las condiciones proceden; las demas se omiten.
4. **Resolucion de Prioridad:** Determinar la prioridad efectiva para las notificaciones de cada regla — usar el `deliveryPriority` de la regla si esta configurado, de lo contrario heredar el campo `priority` del evento.
5. **Ejecutar Acciones:** Para cada regla coincidente, iterar a traves de su arreglo `actions`. Cada accion especifica una plantilla, canales y tipo de destinatario.
6. **Resolver Destinatarios y Preferencias de Canal:** Para cada accion, resolver la lista de destinatarios basandose en `recipientType` (cliente, grupo o personalizado). Luego realizar resolucion de canal en 3 partes: (1) buscar preferencias de canal del cliente por `customer_id` desde cache o BD, (2) verificar anulaciones criticas de canal por `event_type` desde cache, (3) calcular canales efectivos — combinando canales definidos por la regla filtrados por preferencias con cualquier canal forzado por anulaciones.
7. **Evaluar Supresion:** Para cada destinatario, evaluar la configuracion de `suppression` de la regla (si existe). Las notificaciones suprimidas se registran con un estado terminal SUPPRESSED via RabbitMQ (fire-and-forget) — no se persisten como filas completas de `notifications`.
8. **Renderizar Plantilla:** Llamar al Servicio de Plantillas (HTTP `POST /templates/:id/render`) para cada variante de canal. Pasar el payload plano del evento como datos de variables de la plantilla. En caso de fallo, marcar la notificacion como FAILED.
9. **Despachar y ACK:** Publicar notificaciones renderizadas al exchange `xch.notifications.deliver` con clave de enrutamiento `notification.deliver.{priority}.{channel}`. Publicar transiciones de estado al exchange `xch.notifications.status` asincronamente. Hacer ACK del mensaje de RabbitMQ.

### Figura 3.1 — Pipeline de Procesamiento de Eventos

```
    ┌──────────────────────────┐
    │  1. Consumir Evento       │  ◄── RabbitMQ: q.engine.events.{priority}
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  2. Busqueda de Reglas    │  ◄── Consultar reglas activas por eventType
    └────────────┬─────────────┘      (BD directa o cache en memoria)
                 ▼
     ◆ 3. Evaluar Condiciones  ◆────── Sin coincidencia ──▶ [ACK, omitir]
                 │
              Coincidencia(s)
                 ▼
    ┌──────────────────────────┐
    │  4. Resolucion de         │  ◄── deliveryPriority ?? event.priority
    │     Prioridad             │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  5. Ejecutar Acciones     │  ◄── Para cada accion en regla(s) coincidente(s)
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  6. Resolver Destinatarios│  ◄── cliente | grupo | personalizado
    └────────────┬─────────────┘      + preferencias de canal (customer_id)
                 ▼                    + anulaciones criticas (event_type)
    ┌──────────────────────────┐      = canales efectivos
    │  6b. Resolucion de Canal │  ◄── preferencias ∩ reglas ∪ anulaciones
    └────────────┬─────────────┘
                 ▼
     ◆ 7. Evaluar Supresion   ◆────── Suprimido ──▶ [Registrar SUPPRESSED async, omitir]
                 │
              Pasa
                 ▼
    ┌──────────────────────────┐
    │  8. Renderizar Plantilla  │  ◄── HTTP POST al Servicio de Plantillas
    └────────────┬─────────────┘      por variante de canal
                 │
          ┌──────┴──────┐
          │ Renderizado │
          │  OK?        │
          └──┬──────┬───┘
            Si     No ──▶ [Marcar FAILED, registrar async]
             │
             ▼
    ┌──────────────────────────┐
    │  9. Despachar y ACK       │  ◄── Publicar a xch.notifications.deliver
    └──────────────────────────┘      Publicar estado async, ACK mensaje
```

---

## 4. Motor de Reglas

El motor de reglas es el componente central de toma de decisiones. Determina que eventos activan notificaciones, bajo que condiciones y con que configuracion. Las reglas son creadas y gestionadas por el equipo operativo a traves de la UI de Administracion — no se requieren cambios de codigo ni despliegues.

### 4.1 Sistema de Coincidencia de Reglas

Cuando llega un evento normalizado, el motor lo evalua contra las reglas en dos fases:

**Fase 1 — Filtro por Tipo de Evento:** Consultar todas las reglas activas cuyo `event_type` coincida con el `eventType` del evento. Este es el filtro primario y usa una busqueda indexada.

**Fase 2 — Evaluacion de Condiciones:** Para cada regla que coincide por tipo de evento, evaluar el objeto JSONB `conditions` contra los campos planos del evento usando un evaluador de expresiones simple.

#### Operadores de Condicion Soportados

| Operador | Descripcion | Ejemplo |
|---|---|---|
| `$eq` | Igualdad exacta | `"sourceId": { "$eq": "oms" }` |
| `$ne` | No igual | `"status": { "$ne": "cancelled" }` |
| `$in` | Valor en lista | `"sourceId": { "$in": ["oms", "magento"] }` |
| `$nin` | Valor no en lista | `"channel": { "$nin": ["sms"] }` |
| `$gt` | Mayor que | `"totalAmount": { "$gt": 100 }` |
| `$gte` | Mayor o igual que | `"totalAmount": { "$gte": 0 }` |
| `$lt` | Menor que | `"totalAmount": { "$lt": 1000 }` |
| `$lte` | Menor o igual que | `"quantity": { "$lte": 50 }` |
| `$exists` | Campo existe (y no es null) | `"customerEmail": { "$exists": true }` |
| `$regex` | Coincidencia por patron regex | `"orderId": { "$regex": "^ORD-2026" }` |
| *(valor directo)* | Abreviatura para `$eq` | `"sourceId": "oms"` |

Todas las condiciones dentro de una regla se combinan con AND logico — cada condicion debe pasar para que la regla coincida. Si el objeto `conditions` esta vacio o es null, la regla coincide con todos los eventos del `eventType` configurado.

#### Prioridad y Exclusividad de Reglas

- Las reglas se priorizan por un campo `priority` (numero menor = mayor prioridad, por defecto: 100).
- Si multiples reglas coinciden con un solo evento, **todas las reglas coincidentes se ejecutan** — cada una produce su propio conjunto de notificaciones.
- Si una regla esta marcada con `is_exclusive = true`, solo la regla exclusiva de mayor prioridad se ejecuta y las coincidencias subsiguientes (tanto exclusivas como no exclusivas) se omiten para ese evento.

```
Evento llega (eventType: "order.shipped")
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Reglas activas para "order.shipped" (por prior)│
│                                                 │
│  1. Regla A  priority=10  exclusive=false        │  ──▶ COINCIDE ──▶ Ejecutar acciones
│  2. Regla B  priority=20  exclusive=true         │  ──▶ COINCIDE ──▶ Ejecutar acciones, DETENER (exclusiva)
│  3. Regla C  priority=30  exclusive=false        │  ──▶ OMITIDA (Regla B fue exclusiva)
│  4. Regla D  priority=40  exclusive=false        │  ──▶ OMITIDA (Regla B fue exclusiva)
└─────────────────────────────────────────────────┘

Sin Regla B (exclusiva), las Reglas A, C y D se ejecutarian todas.
```

### 4.2 Esquema de Configuracion de Reglas

```json
{
  "ruleId": "r-550e8400-e29b-41d4-a716-446655440000",
  "name": "Order Shipped Notification",
  "description": "Send shipping confirmation to customer and ops team when order is shipped",
  "eventType": "order.shipped",
  "conditions": {
    "sourceId": { "$in": ["oms", "magento"] },
    "totalAmount": { "$gte": 0 },
    "customerEmail": { "$exists": true }
  },
  "actions": [
    {
      "actionId": "act-001",
      "templateId": "tpl-order-shipped",
      "channels": ["email", "sms", "push"],
      "recipientType": "customer",
      "delayMinutes": 0
    },
    {
      "actionId": "act-002",
      "templateId": "tpl-order-shipped-internal",
      "channels": ["email"],
      "recipientType": "group",
      "recipientGroupId": "grp-ops-team",
      "delayMinutes": 5
    }
  ],
  "suppression": {
    "dedupKey": ["eventType", "orderId", "recipient.email"],
    "modes": {
      "cooldown": { "intervalMinutes": 1440 }
    }
  },
  "deliveryPriority": null,
  "priority": 10,
  "isExclusive": false,
  "isActive": true,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-02-10T08:30:00.000Z"
}
```

#### Descripciones de Campos

| Campo | Tipo | Requerido | Descripcion |
|---|---|---|---|
| `ruleId` | UUID | Auto | Identificador unico de la regla |
| `name` | string | Si | Nombre legible de la regla |
| `description` | string | No | Descripcion detallada del proposito de la regla |
| `eventType` | string | Si | Tipo de evento en notacion de punto a coincidir (ej., `order.shipped`) |
| `conditions` | object | No | Expresiones de condicion JSONB evaluadas contra campos planos del evento. Si es null/vacio, coincide con todos los eventos de este tipo. |
| `actions` | array | Si | Arreglo ordenado de acciones a ejecutar cuando la regla coincide |
| `actions[].templateId` | string | Si | ID de plantilla a renderizar para esta accion |
| `actions[].channels` | string[] | Si | Canales objetivo (`email`, `sms`, `whatsapp`, `push`) |
| `actions[].recipientType` | string | Si | `customer`, `group`, o `custom` |
| `actions[].recipientGroupId` | string | Condicional | Requerido cuando `recipientType` es `group` |
| `actions[].customRecipients` | array | Condicional | Requerido cuando `recipientType` es `custom` — lista explicita de destinatarios |
| `actions[].delayMinutes` | number | No | Retraso antes de procesar esta accion (por defecto: 0) |
| `suppression` | object | No | Configuracion opcional de supresion/dedup. `null` = sin supresion. |
| `deliveryPriority` | string | No | Anular prioridad del evento: `normal`, `critical`, o `null` (heredar del evento) |
| `priority` | number | No | Orden de coincidencia de reglas (menor = mayor prioridad, por defecto: 100) |
| `isExclusive` | boolean | No | Si es true, previene que reglas de menor prioridad se ejecuten (por defecto: false) |
| `isActive` | boolean | Si | Solo se evaluan las reglas activas |

### 4.3 Estrategia de Cache de Reglas

Por defecto (`RULE_CACHE_ENABLED=false`), cada busqueda de regla consulta PostgreSQL directamente — no hay capa de cache involucrada. Este es el modo mas simple y adecuado para desarrollo, entornos de bajo rendimiento y despliegues simples.

Cuando `RULE_CACHE_ENABLED=true`, el servicio usa un **cache eager** con **invalidacion dirigida por eventos** para mantener la base de datos fuera de la ruta critica completamente:

**Fase 1 — Carga Eager en Inicio**

Al arrancar, antes de que el servicio comience a consumir eventos, ejecuta:

```sql
SELECT * FROM notification_rules WHERE is_active = true;
```

Todas las filas se cargan en un `Map<eventType, Rule[]>` en memoria agrupado por tipo de evento. El servicio no enlaza sus consumidores de RabbitMQ hasta que el cache este completamente poblado.

**Fase 2 — Invalidacion Dirigida por Eventos**

Cada vez que una regla se crea, actualiza o desactiva via el Servicio de Administracion, este publica un evento de invalidacion al exchange `xch.config.events` con clave de enrutamiento `config.rule.changed`. El payload del evento contiene el `id` de la regla y el timestamp `updated_at`.

El Motor de Notificaciones se suscribe via la cola `q.config.rule-cache`. Al recibir un evento de invalidacion:

1. Obtiene la fila actualizada de `notification_rules` desde PostgreSQL por `id`.
2. Compara el `updated_at` obtenido con el timestamp en cache.
3. Si el timestamp obtenido es mas reciente, reemplaza la entrada en cache (o la elimina si `is_active = false`).
4. Si el timestamp obtenido es igual o anterior (entrega fuera de orden), el evento se descarta.

```
  Servicio de Admin              RabbitMQ                    Motor de Notificaciones
       │                              │                                │
       │  Regla actualizada          │                                │
       │  (via Admin UI)             │                                │
       │                              │                                │
       │  Publicar a xch.config.events│                                │
       │  clave: config.rule.changed  │                                │
       │─────────────────────────────▶│                                │
       │                              │  Entregar a                    │
       │                              │  q.config.rule-cache           │
       │                              │───────────────────────────────▶│
       │                              │                                │
       │                              │                    ┌───────────┴───────────┐
       │                              │                    │ 1. Obtener fila       │
       │                              │                    │    actualizada de     │
       │                              │                    │    PostgreSQL         │
       │                              │                    │ 2. Comparar updated_at│
       │                              │                    │ 3. Reemplazar en cache│
       │                              │                    │    (si es mas reciente)│
       │                              │                    └───────────┬───────────┘
       │                              │                                │
       │                              │                    Cache actualizado (~100ms)
```

> **Info:** **Cuando Habilitar el Cache de Reglas**
>
> Habilitar `RULE_CACHE_ENABLED=true` en entornos de **produccion** y **alto rendimiento** donde las busquedas de reglas agregarian latencia innecesaria y presion sobre la base de datos en cada evento. Dejarlo deshabilitado (`false`) en **desarrollo** y **despliegues simples** donde se prefiere la simplicidad operativa de consultas directas a la base de datos y los volumenes de eventos son bajos. El numero de reglas activas es tipicamente pequeno (decenas a cientos bajos), haciendo el footprint en memoria insignificante.
