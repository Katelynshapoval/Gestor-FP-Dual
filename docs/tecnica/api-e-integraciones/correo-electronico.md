# Correo electrónico y notificaciones

> Código: [`mail/config.js`](../../../backend/src/mail/config.js) (transporte), [`mail/plantilla.js`](../../../backend/src/mail/plantilla.js) (lenguaje de plantillas), [`correoPlantillas.js`](../../../backend/src/services/correoPlantillas.js) (carga desde la BD y `CONTRATO`), [`notificaciones.js`](../../../backend/src/services/notificaciones.js) (cuándo y a quién), [`correosService.js`](../../../backend/src/services/correosService.js) (pantalla «Correos»). Script de prueba: [`scripts/probarCorreos.js`](../../../backend/scripts/probarCorreos.js). Pruebas: `phase4.test.js`, `correos.test.js`, `convenioPendiente.test.js`.

## 1. Transporte

| Variable | Efecto |
| --- | --- |
| `MAIL_MODE` | `smtp` = envía por Gmail; `log` = no envía y escribe `[correo:log] no enviado · para j***@dominio · «asunto»`. **Por defecto**: `smtp` solo con `NODE_ENV=production`, si no `log` |
| `EMAIL_USER`, `EMAIL_PASS` | Credenciales de Gmail (remitente `"Salesianos Dual" <EMAIL_USER>`) |
| `MAIL_REDIRECT_TO` | Solo en `smtp`: todo correo va a esa dirección con el asunto prefijado `[para j***@…]` |
| `APP_URL` | Enlace al portal en el pie de cada notificación y base del enlace de recuperación |

El modo se decide al cargar el módulo y se escribe en consola al arrancar (`[correo] modo de envío: …`).

## 2. Plantillas

Desde la migración 022 **ningún texto de correo está en el código**. Asunto y cuerpo de cada correo están en `dual_correo_plantillas` (una fila por `clave`) y los edita Administración en el menú **«Correos»** ([endpoints](referencia-endpoints.md#correos-automáticos--correosroute), [tablas](../base-de-datos/modelo-de-datos.md#dual_correo_plantillas-022)). El código solo decide **cuándo** se envía, **a quién** y **con qué valores**: `correoPlantillas.CONTRATO` lista, por clave, las variables que `notificaciones.js` rellena. La fila `pie` se añade al final de todos los correos.

| Sintaxis | Resultado |
| --- | --- |
| `{{variable}}` | Valor escapado como HTML. `ENLACE`: enlace si es http(s). `LISTA`: elementos separados por comas |
| `{{#v}} … {{/v}}` / `{{^v}} … {{/v}}` | Solo si `v` no está vacía / solo si está vacía. Pueden ocupar varios párrafos |
| `**texto**` | Negrita |
| `[texto](https://…)` o `[texto]({{enlace}})` | Enlace; cualquier otro esquema se deja como texto |
| Línea en blanco | Párrafo nuevo (un salto simple se conserva como `<br>`) |
| Párrafo que es solo una variable `LISTA` | Lista con viñetas |

- **Seguridad (SEC-10).** Se escapa también el texto del administrador, así que una plantilla no puede inyectar HTML. Los valores se insertan al final, mediante marcadores, de modo que un valor nunca se interpreta como marcado ni como otra variable.
- **Validación al guardar** (`plantilla.validar`): variables que ese correo no tiene, bloques sin cerrar o mal cerrados, llaves sueltas, variables obligatorias ausentes (`{{enlace}}` en `restablecer_contrasena`, `{{reservas_canceladas}}` en `cupo_reducido_empresa`), `ENLACE`/`LISTA` en el asunto, enlaces que no son http(s), asunto de varias líneas o de más de 200 caracteres, cuerpo de más de 10 000.
- **Al enviar** se vuelve a validar. Plantilla **desactivada** → no se envía (se registra). Plantilla **ausente o no válida** → no se envía y se registra el error; la operación que la disparó no cambia. El pie no válido se omite.
- **Al arrancar** (`correoPlantillas.verificar`) se comprueba que cada clave del `CONTRATO` existe, es válida y no declara variables que el código no envía; si no, `[correo] plantillas con problemas (no se enviarán): …`.
- **Concurrencia.** Cada guardado lleva la `version` de la que partió el editor; si otro administrador guardó entretanto, 409 `VERSION_CAMBIADA`. Cada guardado es una versión nueva en `dual_correo_plantillas_historial` y un evento `CORREO` en la misma transacción.
- **Vista previa y prueba** usan los valores `ejemplo` de `dual_correo_variables`. La prueba va solo al email del administrador, con el asunto «[Prueba] …», y respeta `MAIL_MODE`.
- Las pruebas leen las filas directamente de `db/migrations/022_correo_plantillas.sql` y aplican encima lo que hace `023_correo_adjuntos.sql` (`test/helpers/correoSeed.js`), así que prueban exactamente el texto y los adjuntos iniciales de la base de datos.

### 2.1 Adjuntos (migración 023)

Si un correo lleva adjuntos, y cuáles, también está en la base de datos y lo decide Administración en «Correos»:

- **`dual_correo_plantillas.lleva_adjuntos`**: el interruptor «Lleva adjuntos». Desactivado, el correo se envía sin adjuntos aunque tenga alguno configurado.
- **`dual_correo_adjuntos`**: los adjuntos de cada correo, de dos tipos:
  - `DOCUMENTO`: un documento que la aplicación **genera desde plantilla** para cada solicitud. La fila dice *qué* documento; al enviar se adjunta **el de esa solicitud**: su documento actual en `dual_documentos`, generado con la plantilla activa de ese tipo (o la copia firmada que lo sustituyó). Nunca se genera uno solo para enviar un correo. Qué documentos admite cada correo lo fija el código (`correoPlantillas.DOCUMENTOS`), porque el documento debe pertenecer a la solicitud de la que trata el correo:
    - `CONVENIO`: `solicitud_empresa_recibida`, `convenio_disponible`, `solicitud_empresa_validada`, `documento_rechazado_empresa`.
    - `ANEXO_II` y `ANEXO_III` (solo existe el que pide el tipo de contrato): `reserva_creada_alumno`, `reserva_creada_empresa`, `reserva_confirmada_alumno`, `reserva_confirmada_empresa`, `documento_rechazado_reserva`.
    El editor muestra la plantilla activa de cada documento y avisa si no hay ninguna.
  - `ARCHIVO`: un PDF fijo subido por un administrador (por ejemplo, una guía), guardado en la tabla y enviado tal cual. Solo PDF (se comprueba la firma `%PDF-`), hasta 5 MB y 5 por correo. Cualquier correo salvo el pie.
- **Al enviar** (`correoPlantillas.componer`): si `lleva_adjuntos = 1`, se adjuntan los `ARCHIVO` y los `DOCUMENTO` que existan para esa solicitud (`notificaciones.documentosDe` los lee; el convenio recién generado se pasa directamente). Un documento que la solicitud no tiene (aún no generado, sin plantilla activa, o el Anexo que su contrato no usa) se omite y el correo sale igualmente. Nombre del fichero: `<DOCUMENTO>_<empresa o alumno>_<año>.pdf`.
- **Variables**: para cada documento que el correo puede llevar existe `<documento>_adjunto` (`convenio_adjunto`, `anexo_ii_adjunto`, `anexo_iii_adjunto`; migraciones 023 y 024), con «sí» solo si de verdad se ha adjuntado. `solicitud_empresa_recibida` tiene además `convenio_generado` («sí» si el convenio existe, vaya adjunto o no). Así un solo texto cubre los tres casos con bloques `{{#…}}` / `{{^…}}`.
- **Versiones**: añadir o quitar un adjunto y cambiar el interruptor crean una versión nueva (`dual_correo_plantillas_historial.lleva_adjuntos` y `adjuntos`, la lista de nombres) y un evento `CORREO` (`ADJUNTO_ANADIR`, `ADJUNTO_QUITAR` o `EDITAR`). Añadir el primer adjunto activa el interruptor. «Restaurar» recupera solo el texto; los adjuntos no cambian.
- **Vista previa y prueba**: la vista previa muestra los adjuntos que irían según el interruptor del borrador. La prueba lleva los `ARCHIVO`; los `DOCUMENTO` no, porque solo existen para una solicitud real (el mensaje lo indica).
- La migración 023 fusionó las dos parejas de correos que solo existían porque el adjunto se decidía en el código (`solicitud_empresa_recibida_convenio` → `solicitud_empresa_recibida`, `convenio_disponible_adjunto` → `convenio_disponible`).

## 3. Reglas de envío

- Siempre **después del commit**, sin `await` en el camino de la respuesta: un fallo nunca cambia la respuesta HTTP.
- `notificaciones.safe` captura cualquier excepción y la registra.
- Cada función **relee** de la BD los datos que necesita, para no enviar valores de una transacción deshecha.
- Todo valor se escapa como HTML al renderizar la plantilla (§2).
- **No** incluyen DNI/NIE, teléfonos ni el motivo libre de cancelación. Los motivos de **rechazo** sí se envían a quien debe corregir. Excepción: el correo de reducción de cupo a la empresa incluye nombre y **DNI** de cada alumno cancelado.
- Sin dirección de destino → aviso en consola, no se envía.
- No hay cola, reintentos ni registro persistente de envíos.

## 4. Eventos y destinatarios

Clave de la plantilla entre paréntesis.

| Evento | Disparado por | Alumno | Empresa (coordinador) |
| --- | --- | --- | --- |
| Solicitud de alumno recibida (`solicitud_alumno_recibida`) | `POST /solicitudes/alumno` | ✔ (email del formulario) | |
| Solicitud de alumno validada / rechazada (`solicitud_alumno_validada`, `_rechazada`) | `aplicarTransicion` | ✔ (rechazo con motivo) | |
| Solicitud de empresa recibida (`solicitud_empresa_recibida`) | Alta y reaplicación, **siempre**. Se ofrece el PDF del convenio si se generó; va adjunto si el correo lleva adjuntos (§2.1). Si no se generó (sin plantilla activa o error al generar), el texto avisa de que estará en el portal cuando el centro lo genere | | ✔ |
| Convenio disponible (`convenio_disponible`) | `POST /documentos/generar` de un CONVENIO (también al regenerar) y «Generar convenios pendientes». El PDF va adjunto si el correo lleva adjuntos (§2.1) | | ✔ |
| Solicitud de empresa validada / rechazada (`solicitud_empresa_validada`, `_rechazada`) | `aplicarTransicion`, validación del convenio | | ✔ |
| Documento rechazado (`documento_rechazado_alumno`, `_empresa`, `_reserva`) | `POST /documentos/:id/rechazar` | ✔ si es de su solicitud | ✔ si es de la solicitud de empresa **o de una reserva** |
| Reserva creada por la empresa (`reserva_creada_alumno`) | `POST /reservas` | ✔ | |
| Reserva creada por el centro / destino de reasignación (`reserva_creada_alumno`, `reserva_creada_empresa`) | `/reservas/admin`, `reasignar` | ✔ | ✔ |
| Reserva cancelada por la empresa (`reserva_cancelada_alumno`) | `/reservas/:id/cancelar` | ✔ | |
| Reserva cancelada por el centro / origen de reasignación (`reserva_cancelada_alumno`, `reserva_cancelada_empresa`) | `cancelar-admin`, `reasignar` | ✔ | ✔ |
| Hermanas canceladas al confirmar | `confirmar` | | ✔ (cada empresa afectada) |
| Reserva confirmada (`reserva_confirmada_alumno`, `_empresa`) | `confirmar` | ✔ | ✔ |
| Reducción de cupo (`cupo_reducido_empresa` + `reserva_cancelada_alumno`) | `updateCupoEspecialidad` | ✔ (aviso de cancelación) | ✔ (resumen con la lista) |
| Baja de alumno (`reserva_cancelada_empresa`) | `bajaService` | | ✔ (cada reserva cancelada) |
| Baja de empresa (`reserva_cancelada_alumno`) | `bajaService` | ✔ (cada reserva cancelada) | |
| Ciclo de la solicitud corregido por el centro (`ciclo_corregido`) | Edición directa o petición aprobada que cambia el ciclo | ✔ | |
| Petición de corrección de datos aprobada / rechazada (`cambio_datos_aprobado`, `_rechazado`) | `alumnoCambiosService` | ✔ (rechazo con motivo) | |
| Recuperación de contraseña (`restablecer_contrasena`, no desactivable) | `/auth/forgotPassword` | Personal, alumno o coordinador (según la cuenta) | |

Todos se envían **después del commit**: si la operación se deshace, no sale ningún correo.

Eventos **sin** correo: reabrir, reactivar, cambio de tipo de contrato, firmas, validación de documentos (salvo la cascada del convenio), subidas, la petición de corrección del alumno (al enviarla), las solicitudes de cambio de datos de **empresa** y su resolución, la edición directa de datos del alumno que no cambia el ciclo, asignación de tutor, contraseña temporal del administrador.

## 5. Verificación manual

`node scripts/probarCorreos.js` envía una vez cada plantilla, con el texto y los adjuntos que haya en la base de datos, usando los datos de prueba de `seedPruebas.js`. Los dos correos del convenio se envían con y sin un PDF de prueba en lugar del convenio real. Se niega a ejecutarse si no hay `MAIL_MODE=smtp` **y** `MAIL_REDIRECT_TO`, o si `NODE_ENV=production`; no cambia estados ni escribe eventos.
