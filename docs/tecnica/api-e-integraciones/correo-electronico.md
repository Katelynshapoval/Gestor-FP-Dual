# Correo electrónico y notificaciones

> Código: [`mail/config.js`](../../../backend/src/mail/config.js), [`notificaciones.js`](../../../backend/src/services/notificaciones.js), correos directos en `solicitudesAlumnoService` y `solicitudesEmpresaService`. Script de prueba: [`scripts/probarCorreos.js`](../../../backend/scripts/probarCorreos.js). Pruebas: `phase4.test.js`.

## 1. Transporte

| Variable | Efecto |
| --- | --- |
| `MAIL_MODE` | `smtp` = envía por Gmail; `log` = no envía y escribe `[correo:log] no enviado · para j***@dominio · «asunto»`. **Por defecto**: `smtp` solo con `NODE_ENV=production`, si no `log` |
| `EMAIL_USER`, `EMAIL_PASS` | Credenciales de Gmail (remitente `"Salesianos Dual" <EMAIL_USER>`) |
| `MAIL_REDIRECT_TO` | Solo en `smtp`: todo correo va a esa dirección con el asunto prefijado `[para j***@…]` |
| `APP_URL` | Enlace al portal en el pie de cada notificación y base del enlace de recuperación |

El modo se decide al cargar el módulo y se escribe en consola al arrancar (`[correo] modo de envío: …`).

## 2. Reglas de envío

- Siempre **después del commit**, sin `await` en el camino de la respuesta: un fallo nunca cambia la respuesta HTTP.
- `notificaciones.safe` captura cualquier excepción y la registra.
- Cada función **relee** de la BD los datos que necesita, para no enviar valores de una transacción deshecha.
- Todo valor interpolado se escapa como HTML (`html` *tagged template*).
- **No** incluyen DNI/NIE, teléfonos ni el motivo libre de cancelación. Los motivos de **rechazo** sí se envían a quien debe corregir. Excepción: el correo de reducción de cupo a la empresa incluye nombre y **DNI** de cada alumno cancelado.
- Sin dirección de destino → aviso en consola, no se envía.
- No hay cola, reintentos ni registro persistente de envíos.

## 3. Eventos y destinatarios

| Evento | Disparado por | Alumno | Empresa (coordinador) |
| --- | --- | --- | --- |
| Solicitud de alumno recibida | `POST /solicitudes/alumno` | ✔ (email del formulario) | |
| Solicitud de alumno validada / rechazada | `aplicarTransicion` | ✔ (rechazo con motivo) | |
| Solicitud de empresa recibida (+ PDF del convenio) | Alta y reaplicación, **solo si se generó el convenio** | | ✔ |
| Solicitud de empresa validada / rechazada | `aplicarTransicion`, validación del convenio | | ✔ |
| Documento rechazado | `POST /documentos/:id/rechazar` | ✔ si es de su solicitud | ✔ si es de la solicitud de empresa **o de una reserva** |
| Reserva creada por la empresa | `POST /reservas` | ✔ | |
| Reserva creada por el centro / destino de reasignación | `/reservas/admin`, `reasignar` | ✔ | ✔ |
| Reserva cancelada por la empresa | `/reservas/:id/cancelar` | ✔ | |
| Reserva cancelada por el centro / origen de reasignación | `cancelar-admin`, `reasignar` | ✔ | ✔ |
| Hermanas canceladas al confirmar | `confirmar` | | ✔ (cada empresa afectada) |
| Reserva confirmada | `confirmar` | ✔ | ✔ |
| Reducción de cupo | `updateCupoEspecialidad` | ✔ (aviso de cancelación) | ✔ (resumen con la lista) |
| Baja de alumno | `bajaService` | | ✔ (cada reserva cancelada) |
| Baja de empresa | `bajaService` | ✔ (cada reserva cancelada) | |
| Ciclo de la solicitud corregido por el centro | Edición directa o petición aprobada que cambia el ciclo | ✔ «Hemos corregido el ciclo de tu solicitud de FP Dual» | |
| Petición de corrección de datos aprobada / rechazada | `alumnoCambiosService` | ✔ (rechazo con motivo) | |
| Recuperación de contraseña | `/auth/forgotPassword` | Personal, alumno o coordinador (según la cuenta) | |

Todos se envían **después del commit**: si la operación se deshace, no sale ningún correo.

Eventos **sin** correo: reabrir, reactivar, cambio de tipo de contrato, firmas, validación de documentos (salvo la cascada del convenio), subidas, la petición de corrección del alumno (al enviarla), las solicitudes de cambio de datos de **empresa** y su resolución, la edición directa de datos del alumno que no cambia el ciclo, asignación de tutor, contraseña temporal del administrador.

## 4. Verificación manual

`node scripts/probarCorreos.js` envía una vez cada plantilla usando los datos de prueba de `seedPruebas.js`. Se niega a ejecutarse si no hay `MAIL_MODE=smtp` **y** `MAIL_REDIRECT_TO`, o si `NODE_ENV=production`; no cambia estados ni escribe eventos.
