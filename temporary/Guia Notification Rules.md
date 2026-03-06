# Guia de Notification Rules

## Objetivo

Las **Notification Rules** (Reglas de Notificacion) son el componente central de configuracion del sistema de notificaciones. Una regla define **que sucede** cuando llega un evento determinado: a quien se notifica, por que canal, con que plantilla y bajo que condiciones.

El sistema es completamente declarativo: no se requieren cambios de codigo para agregar, modificar o desactivar comportamientos de notificacion. Todo se gestiona mediante operaciones CRUD sobre las reglas.

**En resumen:** Un evento llega al sistema -> se buscan todas las reglas activas que coincidan con el tipo de evento -> se evaluan las condiciones -> se ejecutan las acciones de cada regla que haga match (enviar notificaciones por los canales configurados, a los destinatarios indicados, usando la plantilla especificada).

---

## Campos de una Regla

### 1. Name (Nombre)

Nombre descriptivo y legible de la regla. Es obligatorio.

- **Ejemplo:** `"Pedido Enviado - Email + SMS"`
- **Proposito:** Identificar rapidamente la regla en la lista de administracion.

### 2. Event Type (Tipo de Evento)

El tipo de evento al que responde esta regla, expresado en notacion de puntos. Es obligatorio y **no se puede modificar una vez creada la regla**.

- **Ejemplos:** `order.shipped`, `order.created`, `payment.failed`, `user.registered`
- **Comportamiento:** Cuando un evento llega al sistema, se buscan todas las reglas activas cuyo `eventType` coincida exactamente con el tipo del evento entrante.
- **Importante:** Multiples reglas pueden tener el mismo `eventType`. Por defecto, **todas** las reglas que coincidan se ejecutan (a menos que alguna sea exclusiva; ver seccion "Is Exclusive").

### 3. Description (Descripcion)

Campo de texto libre opcional para documentar el proposito o contexto de la regla.

- **Ejemplo:** `"Notifica al cliente y al equipo de operaciones cuando un pedido cambia a estado enviado"`

### 4. Priority (Prioridad de Evaluacion)

Numero entero que determina el **orden de evaluacion** de las reglas cuando multiples reglas coinciden con el mismo tipo de evento. **Menor numero = mayor prioridad** (se evalua primero).

- **Valor por defecto:** `100`
- **Rango:** Cualquier entero positivo (0, 1, 2, ... 100, 200, etc.)
- **Ejemplo:** Una regla con `priority: 10` se evalua antes que una regla con `priority: 100`.
- **Uso principal:** Controlar el orden de ejecucion y, en combinacion con `isExclusive`, determinar que reglas se saltan.

### 5. Is Exclusive (Es Exclusiva)

Interruptor booleano (si/no). Cuando esta activado y la regla hace match, **todas las reglas de menor prioridad (numero mayor) se omiten** para ese evento.

- **Valor por defecto:** `false` (desactivado)
- **Comportamiento detallado:**
  - Las reglas se evaluan en orden de prioridad (de menor a mayor numero).
  - Las reglas no exclusivas que hagan match **antes** de la exclusiva se siguen ejecutando.
  - En cuanto una regla exclusiva hace match, se detiene la evaluacion. Ninguna regla posterior se evalua.

**Ejemplo:**

| Regla | Prioridad | Exclusiva | Match? | Resultado |
|-------|-----------|-----------|--------|-----------|
| Regla A | 10 | No | Si | Se ejecuta |
| Regla B | 20 | **Si** | Si | Se ejecuta, **DETIENE evaluacion** |
| Regla C | 30 | No | Si | **Se omite** (nunca se evalua) |
| Regla D | 40 | No | Si | **Se omite** (nunca se evalua) |

### 6. Delivery Priority (Prioridad de Entrega)

Controla la prioridad con la que se entrega la notificacion resultante. Afecta la cola de RabbitMQ a la que se envia el mensaje.

- **Opciones:**
  - **Inherit (Heredar):** Usa la prioridad que trae el evento original (valor por defecto si no se configura).
  - **Normal:** Fuerza prioridad normal independientemente del evento.
  - **Critical:** Fuerza prioridad critica, lo que enruta la notificacion a colas de alta prioridad para procesamiento mas rapido.

- **Uso tipico:** Configurar como `Critical` reglas que manejan eventos sensibles al tiempo (ej: restablecimiento de contrasena, alertas de fraude).

### 7. Is Active (Esta Activa)

Indica si la regla esta activa y debe ser evaluada.

- **Valor por defecto:** `true` (activa)
- **Comportamiento:** Solo las reglas activas participan en la evaluacion de eventos. Eliminar una regla desde la interfaz no la borra fisicamente de la base de datos, sino que la marca como inactiva (`isActive = false`), lo que equivale a una eliminacion logica (soft-delete).
- **Uso tipico:** Desactivar temporalmente una regla sin perder su configuracion.

---

## Conditions (Condiciones)

Las condiciones son **filtros opcionales** que se aplican sobre los campos del payload del evento. Si una regla no tiene condiciones, hace match con **todos** los eventos de su tipo. Si tiene condiciones, **todas** deben cumplirse (logica AND) para que la regla haga match.

### Operadores Disponibles

| Operador | Descripcion | Ejemplo |
|----------|-------------|---------|
| **Equals** (`$eq`) | Igualdad estricta | `sourceId` equals `"oms"` |
| **Not Equals** (`$ne`) | Diferente de | `status` not equals `"cancelled"` |
| **Contains** (`$contains`) | Contiene el valor (subcadena) | `customerEmail` contains `"@empresa.com"` |
| **Greater Than** (`$gt`) | Mayor que (numerico) | `totalAmount` > `1000` |
| **Less Than** (`$lt`) | Menor que (numerico) | `totalAmount` < `50` |
| **Greater or Equal** (`$gte`) | Mayor o igual que | `totalAmount` >= `500` |
| **Less or Equal** (`$lte`) | Menor o igual que | `quantity` <= `10` |
| **In** (`$in`) | El valor esta en una lista | `sourceId` in `["oms", "magento"]` |
| **Not In** (`$nin`) | El valor NO esta en una lista | `region` not in `["test", "staging"]` |
| **Exists** (`$exists`) | El campo existe (o no) en el payload | `customerEmail` exists `true` |
| **Regex** (`$regex`) | El valor coincide con una expresion regular | `orderId` regex `"^ORD-"` |

### Como Funcionan

- Cada condicion se define como una fila con tres campos: **Campo**, **Operador** y **Valor**.
- Se pueden agregar multiples condiciones (filas). Todas deben cumplirse (AND).
- Si no se definen condiciones, la regla aplica para todos los eventos del tipo configurado.
- Los campos se evaluan contra los campos de primer nivel del payload normalizado del evento.

### Ejemplo Practico

Para una regla con `eventType: "order.created"` y las siguientes condiciones:

| Campo | Operador | Valor |
|-------|----------|-------|
| `sourceId` | In | `["oms", "magento"]` |
| `totalAmount` | Greater or Equal | `500` |
| `customerEmail` | Exists | `true` |

Esta regla solo hara match cuando:
1. El evento provenga de los sistemas "oms" o "magento", **Y**
2. El monto total sea mayor o igual a 500, **Y**
3. El campo `customerEmail` exista en el payload del evento.

---

## Actions (Acciones)

Las acciones definen **que se hace** cuando una regla hace match. Cada regla debe tener **al menos una accion**, pero puede tener multiples. Cada accion es independiente y se procesa por separado.

### Campos de una Accion

#### Template ID (ID de Plantilla)

Identificador de la plantilla que se usara para renderizar el contenido de la notificacion. Es obligatorio.

- **Ejemplo:** `"tpl-order-shipped"`, `"tpl-welcome-email"`
- **Comportamiento:** El sistema envia este ID al servicio de plantillas (template-service), que devuelve el contenido renderizado (asunto y cuerpo) usando los datos del evento.

#### Channels (Canales)

Lista de canales de entrega. Debe seleccionarse al menos un canal. Los canales disponibles son:

| Canal | Descripcion | Proveedores |
|-------|-------------|-------------|
| **Email** | Correo electronico | Mailgun, AWS SES, Braze |
| **SMS** | Mensaje de texto | Braze |
| **WhatsApp** | Mensaje de WhatsApp | Meta Cloud API (nativo), Braze |
| **Push** | Notificacion push movil | Braze |

- Cuando se seleccionan multiples canales, se procesan **en paralelo** (cada canal genera una notificacion independiente).
- Los canales estan sujetos a las preferencias del destinatario: si un cliente opto por no recibir SMS, ese canal se filtra automaticamente (excepto para overrides criticos).

#### Recipient Type (Tipo de Destinatario)

Define **a quien** se envia la notificacion. Hay tres opciones:

| Tipo | Descripcion | Campos Requeridos |
|------|-------------|-------------------|
| **Customer** | El cliente asociado al evento. Se extraen los datos de contacto directamente del payload del evento (`customerEmail`, `customerPhone`, `deviceToken`, `customerName`). | Ninguno adicional |
| **Group** | Un grupo predefinido de destinatarios. Todos los miembros activos del grupo reciben la notificacion (una notificacion por miembro). | `recipientGroupId` (obligatorio) |
| **Custom** | Lista explicita de destinatarios definida directamente en la accion. | `customRecipients` (obligatorio): array de objetos con `email`, `phone`, `deviceToken`, `name` |

#### Recipient Group ID (ID de Grupo de Destinatarios)

Solo aplica cuando `recipientType` es `"group"`. Referencia al grupo de destinatarios predefinido.

- **Ejemplo:** `"grp-ops-team"`, `"grp-warehouse-alerts"`

#### Delay Minutes (Minutos de Retraso)

Retraso opcional antes de enviar la notificacion, en minutos.

- **Valor por defecto:** `0` (sin retraso, envio inmediato)
- **Uso tipico:** Retrasar un recordatorio o dar tiempo para que se complete un proceso antes de notificar.
- **Ejemplo:** `delayMinutes: 30` envia la notificacion 30 minutos despues del evento.

### Ejemplo: Regla con Multiples Acciones

```
Regla: "Pedido Enviado - Notificar Cliente y Operaciones"
eventType: "order.shipped"

Accion 1:
  templateId: "tpl-order-shipped-customer"
  channels: [Email, WhatsApp]
  recipientType: Customer
  delayMinutes: 0

Accion 2:
  templateId: "tpl-order-shipped-ops"
  channels: [Email]
  recipientType: Group
  recipientGroupId: "grp-operations-team"
  delayMinutes: 0
```

En este ejemplo, cuando se recibe un evento `order.shipped`:
- **Accion 1:** Envia al cliente un email y un WhatsApp con la plantilla de cliente.
- **Accion 2:** Envia un email al equipo de operaciones (todos los miembros activos del grupo) con la plantilla de operaciones.

---

## Suppression (Supresion)

La supresion es un mecanismo **opcional** para evitar notificaciones duplicadas o excesivas. Se evalua **por destinatario y por canal**.

### Activacion

La supresion solo se activa si se configura tanto una **clave de deduplicacion** como al menos un **modo de supresion**.

### Dedup Key (Clave de Deduplicacion)

Lista de campos cuya combinacion de valores identifica de forma unica una notificacion. Los valores se concatenan y se hashean (SHA-256) para crear una huella digital.

- Los campos pueden provenir del evento (ej: `eventType`, `orderId`, `sourceId`) o del destinatario (ej: `recipient.email`, `recipient.phone`).
- **Ejemplo:** `["eventType", "orderId", "recipient.email"]`
  - Para un evento `order.shipped` con `orderId: "ORD-001"` y destinatario `ana@ejemplo.com`, la clave seria el hash SHA-256 de `"order.shipped|ORD-001|ana@ejemplo.com"`.

### Modos de Supresion

| Modo | Parametros | Descripcion |
|------|------------|-------------|
| **Dedup** | `windowMinutes` | Suprime si ya existe una notificacion no fallida con la misma clave dentro de la ventana de tiempo. **Ejemplo:** `windowMinutes: 60` -> si ya se envio una notificacion identica en la ultima hora, no se envia otra. |
| **Cooldown** | `intervalMinutes` | Suprime si la notificacion mas reciente con la misma clave fue creada hace menos de X minutos. **Ejemplo:** `intervalMinutes: 1440` (24 horas) -> maximo una notificacion por dia para la misma clave. |
| **Max Count** | `windowMinutes`, `limit` | Suprime si se han enviado X o mas notificaciones con la misma clave dentro de la ventana. **Ejemplo:** `windowMinutes: 60, limit: 3` -> maximo 3 notificaciones por hora. |

### Ejemplo de Supresion

```
Supresion para regla "Pago Fallido":
  dedupKey: ["eventType", "orderId", "recipient.email"]
  modos:
    - dedup: windowMinutes = 60
    - maxCount: windowMinutes = 1440, limit = 5
```

Esto significa:
1. Si ya se envio una notificacion de pago fallido para el mismo pedido al mismo destinatario en la ultima hora, se suprime.
2. Ademas, si ya se han enviado 5 notificaciones de pago fallido para el mismo pedido al mismo destinatario en las ultimas 24 horas, se suprime.

Las notificaciones suprimidas no generan un registro completo; solo se publica un evento de estado `SUPPRESSED` de forma asincrona.

---

## Flujo Completo de Evaluacion

```
1. Llega un evento (ej: eventType="order.shipped", priority="normal")
         |
         v
2. Busqueda de reglas: Se obtienen todas las reglas activas cuyo
   eventType coincida, ordenadas por prioridad (menor numero primero)
         |
         v
3. Evaluacion de condiciones: Para cada regla, se evaluan las
   condiciones contra el payload del evento
         |
    No match -> Se descarta (si ninguna regla hace match, el evento se ignora)
         |
    Match(es) encontrado(s) -> Se respeta isExclusive para detener la evaluacion
         |
         v
4. Para cada regla que hizo match:
   Para cada accion de la regla:
         |
         v
   4a. Resolucion de prioridad de entrega:
       Se usa deliveryPriority de la regla, o si es "Inherit",
       se usa la prioridad del evento original
         |
         v
   4b. Resolucion de destinatarios:
       - Customer: se extraen datos del payload del evento
       - Group: se consultan los miembros activos del grupo
       - Custom: se usa la lista inline de la accion
         |
         v
   4c. Para cada destinatario:
       Resolucion de canales efectivos:
       - Se filtran canales segun preferencias del cliente
       - Se agregan canales de overrides criticos si aplica
         |
         v
   4d. Para cada canal efectivo (en paralelo):
       - Verificacion de supresion (si esta configurada)
       - Si suprimida -> se registra como SUPPRESSED, se omite
       - Si no suprimida:
         -> Se crea el registro de notificacion (estado PENDING)
         -> Se renderiza la plantilla
         -> Se envia a la cola de entrega correspondiente
```

---

## Ejemplos Practicos

### Ejemplo 1: Notificacion Simple de Bienvenida

```
Nombre:           "Bienvenida - Email al nuevo usuario"
Tipo de Evento:   user.registered
Prioridad:        100 (defecto)
Exclusiva:        No
Prioridad Entrega: Inherit (normal)
Condiciones:      (ninguna - aplica a todos los eventos user.registered)

Acciones:
  1. templateId: "tpl-welcome"
     channels: [Email]
     recipientType: Customer
```

**Resultado:** Cada vez que se registra un usuario, se le envia un email de bienvenida.

### Ejemplo 2: Alerta Critica de Fraude con Supresion

```
Nombre:           "Alerta de Fraude - Equipo de Seguridad"
Tipo de Evento:   payment.fraud_detected
Prioridad:        5 (alta prioridad de evaluacion)
Exclusiva:        Si
Prioridad Entrega: Critical
Condiciones:
  - riskScore >= 80

Acciones:
  1. templateId: "tpl-fraud-alert"
     channels: [Email, SMS]
     recipientType: Group
     recipientGroupId: "grp-security-team"

Supresion:
  dedupKey: ["eventType", "orderId"]
  modos:
    - dedup: windowMinutes = 30
    - maxCount: windowMinutes = 1440, limit = 10
```

**Resultado:**
- Solo se activa si el puntaje de riesgo es 80 o mas.
- Al ser exclusiva y tener prioridad 5, detiene la evaluacion de otras reglas de menor prioridad para el mismo evento.
- Envia email y SMS al equipo de seguridad.
- La prioridad de entrega critica asegura procesamiento rapido.
- La supresion evita inundar al equipo: maximo una alerta cada 30 minutos por pedido, y maximo 10 en 24 horas.

### Ejemplo 3: Multiples Acciones con Retraso

```
Nombre:           "Pedido Creado - Cliente + Almacen"
Tipo de Evento:   order.created
Prioridad:        100
Exclusiva:        No
Condiciones:
  - sourceId in ["oms", "shopify"]
  - totalAmount >= 100

Acciones:
  1. templateId: "tpl-order-confirmation"
     channels: [Email, WhatsApp]
     recipientType: Customer
     delayMinutes: 0

  2. templateId: "tpl-order-warehouse"
     channels: [Email]
     recipientType: Group
     recipientGroupId: "grp-warehouse"
     delayMinutes: 15
```

**Resultado:**
- Solo para pedidos de los sistemas "oms" o "shopify" con monto >= 100.
- Al cliente se le envia inmediatamente una confirmacion por email y WhatsApp.
- Al equipo de almacen se le notifica 15 minutos despues (dando tiempo a que se confirme el pago).

---

## Consideraciones Importantes

1. **El tipo de evento no se puede cambiar despues de crear la regla.** Si necesita una regla para un tipo de evento diferente, cree una nueva regla.

2. **Duplicados:** El sistema no permite crear dos reglas activas con el mismo `eventType` y las mismas `conditions`. Si necesita comportamiento adicional para el mismo evento, use condiciones diferentes o agregue mas acciones a la regla existente.

3. **Eliminacion logica:** Eliminar una regla desde la interfaz la marca como inactiva, no la borra. Esto permite reactivarla mas tarde si es necesario.

4. **Orden de evaluacion:** Si tiene multiples reglas para el mismo tipo de evento, preste atencion al campo `priority`. Las reglas con menor numero se evaluan primero. Esto es especialmente importante si alguna regla es exclusiva.

5. **Plantillas:** El `templateId` debe corresponder a una plantilla existente en el template-service. Si la plantilla no existe al momento de procesar el evento, la notificacion fallara en la etapa de renderizado.

6. **Canales y preferencias:** Los canales configurados en la accion son el punto de partida. El sistema los filtra automaticamente segun las preferencias del destinatario (opt-out). Sin embargo, los overrides criticos por tipo de evento pueden forzar canales adicionales.

7. **Supresion por destinatario y canal:** La supresion se evalua de forma independiente para cada combinacion de destinatario y canal. Si un mismo evento genera notificaciones para 3 destinatarios, la supresion se verifica por separado para cada uno.

8. **Cache de reglas:** El sistema puede cachear las reglas en memoria para mejorar el rendimiento. Los cambios en las reglas se propagan automaticamente al cache mediante eventos de RabbitMQ. No obstante, puede haber un breve retraso (segundos) entre la modificacion de una regla y su efecto en el procesamiento de eventos.

9. **Grupos de destinatarios:** Al usar `recipientType: "group"`, asegurese de que el grupo exista y tenga miembros activos. Si el grupo esta inactivo o no existe, el procesamiento de esa accion fallara.

10. **Rendimiento:** La tabla de reglas esta optimizada para consultas rapidas por tipo de evento. Se recomienda mantener un numero razonable de reglas (decenas a cientos) y usar condiciones especificas para evitar matches innecesarios.
