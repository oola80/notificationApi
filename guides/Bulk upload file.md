# Guia de Carga Masiva: order.delay.br.max

> **Escenario:** Enviar notificaciones de retraso para pedidos de la marca MAX (Guatemala) que no llegaran en la fecha de entrega original. Las notificaciones se envian por **email** y **WhatsApp**.

## Como Funciona

El archivo XLSX contiene una fila por cada **articulo** del pedido. Si un pedido tiene varios articulos, se agregan varias filas con el mismo `orderId`. El sistema agrupa automaticamente todas las filas que comparten el mismo `orderId` en **un solo evento/notificacion**.

Por ejemplo:
- 2 filas con `orderId: 611214544-A` → se genera **1 notificacion** con 2 articulos
- 1 fila con `orderId: 611214544-B` → se genera **1 notificacion** con 1 articulo

---

## Descripcion de Columnas

### Columnas a Nivel de Pedido (orden)

Estos campos aplican al pedido completo. Si hay varias filas para el mismo `orderId`, los valores de estas columnas deben ser iguales en todas las filas del grupo.

| # | Columna | Tipo | Obligatorio | Descripcion |
|---|---------|------|-------------|-------------|
| 1 | `eventType` | texto | Si | Tipo de evento. **Siempre debe ser `order.delay.br.max`** en todas las filas. |
| 2 | `cycleId` | texto | Si | Identificador del ciclo de negocio. Todas las filas de un mismo lote de carga comparten el mismo valor (ej. `123132`). Sirve para agrupar y rastrear envios por ciclo. |
| 3 | `customerId` | texto | Si | Identificador unico del cliente (puede ser su email, ID de cuenta, etc.). Se usa internamente para vincular al destinatario. |
| 4 | `customerEmail` | texto | Si | Correo electronico del cliente. A esta direccion se enviara la notificacion por email. |
| 5 | `customerName` | texto | Si | Nombre del cliente que aparecera en la notificacion (ej. "Omar Ola"). |
| 6 | `orderId` | texto | Si | Numero de pedido. **Esta es la columna clave de agrupacion:** todas las filas con el mismo `orderId` se combinan en una sola notificacion. Ejemplo: `611214544-A`. |
| 7 | `phone` | texto | No | Numero de telefono del cliente para envio por WhatsApp. **Importante:** formatearlo como Texto en Excel para conservar ceros iniciales (ej. `00502...`). Si se deja como numero, Excel puede eliminar los ceros. |
| 8 | `message` | texto | Si | Texto del cuerpo de la notificacion. Soporta caracteres especiales, acentos y emojis (UTF-8). Ejemplo: *"Lamentamos informarle que su pedido ha sufrido un retraso..."* |
| 9 | `images` | texto JSON | No | Imagenes adjuntas en formato JSON. Se escribe como un arreglo JSON dentro de la celda. Ejemplo: `[{"url":"https://dominio.com/imagen.jpg"}]`. El sistema lo convierte automaticamente a un arreglo de objetos. |
| 10 | `trackingNumber` | texto | No | Numero de rastreo del envio (ej. `FD15454`). |
| 11 | `carrierId` | texto | No | Identificador de la empresa de transporte (ej. `FORZA_GT`). |
| 12 | `trackingURL` | texto | No | URL de la pagina de rastreo del transportista donde el cliente puede consultar el estado de su envio (ej. `https://www.forzadelivery.com/gt/`). |
| 13 | `promiseDate` | texto | No | Fecha de entrega **original** prometida, en formato ISO 8601 (ej. `2026-02-25T06:10:00Z`). |
| 14 | `newPromiseDate` | texto | No | **Nueva** fecha estimada de entrega despues del retraso, en formato ISO 8601 (ej. `2026-02-28T06:10:00Z`). |
| 15 | `sellerId` | texto | No | Identificador del vendedor/seller (ej. `SEL-001`). |
| 16 | `sellerName` | texto | No | Nombre del vendedor que se mostrara en la notificacion (ej. "Electrodomesticos GT"). |

### Columnas a Nivel de Articulo (item)

Estos campos se repiten por cada articulo del pedido. El prefijo `item.` indica que son campos de articulo. El sistema los agrupa automaticamente en un arreglo `items[]` dentro del evento.

| # | Columna | Tipo | Obligatorio | Descripcion |
|---|---------|------|-------------|-------------|
| 17 | `item.sku` | texto | Si | Codigo SKU del articulo (identificador unico del producto, ej. `RUSH`, `FAN-20`). |
| 18 | `item.name` | texto | Si | Nombre del articulo tal como se mostrara en la notificacion (ej. "Ventilador de piso y pared Taurus de 20 pulgadas"). |
| 19 | `item.quantity` | numero | Si | Cantidad ordenada de este articulo (ej. `1`, `2`). |
| 20 | `item.price` | numero | Si | Precio unitario del articulo (ej. `79.99`, `129.99`). |

---

## Ejemplo Practico

Supongamos que el cliente **Omar Ola** hizo un pedido (`611214544-A`) con 2 articulos, y la cliente **Maria Garcia** hizo otro pedido (`611214544-B`) con 1 articulo. El archivo XLSX tendria 3 filas de datos:

| eventType | cycleId | customerId | customerEmail | customerName | orderId | phone | message | images | trackingNumber | carrierId | trackingURL | promiseDate | newPromiseDate | sellerId | sellerName | item.sku | item.name | item.quantity | item.price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| order.delay.br.max | 123132 | omar-ola@hotmail7.com | omar-ola@hotmail.com | Omar Ola | 611214544-A | 40009954 | Lamentamos informarle... | [{"url":"https://..."}] | FD15454 | FORZA_GT | https://www.forzadelivery.com/gt/ | 2026-02-25T06:10:00Z | 2026-02-28T06:10:00Z | SEL-001 | Electrodomesticos GT | RUSH | Ventilador de piso 20 pulg | 1 | 79.99 |
| order.delay.br.max | 123132 | omar-ola@hotmail7.com | omar-ola@hotmail.com | Omar Ola | 611214544-A | 40009954 | Lamentamos informarle... | [{"url":"https://..."}] | FD15454 | FORZA_GT | https://www.forzadelivery.com/gt/ | 2026-02-25T06:10:00Z | 2026-02-28T06:10:00Z | SEL-001 | Electrodomesticos GT | FAN-20 | Ventilador de techo 52 pulg | 2 | 129.99 |
| order.delay.br.max | 123132 | maria.garcia@example.com | maria.garcia@example.com | Maria Garcia | 611214544-B | 50012345 | Lamentamos informarle... | [{"url":"https://..."}] | FD15499 | FORZA_GT | https://www.forzadelivery.com/gt/ | 2026-02-26T08:00:00Z | 2026-03-01T08:00:00Z | SEL-002 | Tech Store GT | TV-55 | Smart TV LED 55 pulg 4K | 1 | 499.99 |

**Resultado:**
- Las filas 1 y 2 comparten `orderId: 611214544-A` → se genera **1 notificacion** para Omar Ola con 2 articulos.
- La fila 3 tiene `orderId: 611214544-B` → se genera **1 notificacion** para Maria Garcia con 1 articulo.

---

## Notas Importantes para el Llenado

### Formato de Fechas
Las fechas (`promiseDate`, `newPromiseDate`) deben ingresarse en formato **ISO 8601**, por ejemplo: `2026-02-25T06:10:00Z`. Si Excel las convierte automaticamente a formato de fecha, el sistema las reconvertira a texto ISO al procesarlas.

### Numeros de Telefono
La columna `phone` debe formatearse como **Texto** en Excel antes de ingresar los valores. Esto evita que Excel elimine ceros iniciales (por ejemplo, `00502...` se convertiria en `502...` si la celda es numerica).

### Imagenes (JSON)
La columna `images` acepta un string JSON dentro de una sola celda. El formato es un arreglo de objetos con la propiedad `url`:
```
[{"url":"https://dominio.com/ruta/imagen.jpg"}]
```
Para multiples imagenes:
```
[{"url":"https://dominio.com/img1.jpg"},{"url":"https://dominio.com/img2.jpg"}]
```

### Celdas Vacias
Las celdas que se dejen vacias simplemente se omiten del evento. No se envian como `null` ni como texto vacio.

### Cantidades y Precios
`item.quantity` e `item.price` son campos numericos. Excel los preserva como numeros automaticamente. No es necesario formateo especial.

### Consistencia en Filas Agrupadas
Cuando hay multiples filas para el mismo `orderId`, los campos a nivel de pedido (columnas 1-16) deben tener los **mismos valores** en todas las filas del grupo. Si hay diferencias, el sistema usara los valores de la primera fila y registrara una advertencia.

### Campo Automatico
El sistema agrega automaticamente `sourceId: "bulk-upload"` a cada evento. Este valor no es configurable y no necesita incluirse en el archivo.
