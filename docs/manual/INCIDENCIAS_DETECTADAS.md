# Incidencias detectadas al redactar el manual

_27/10/2026 · rama `phase-5-design-polish`. Lista de lo que se encontró al documentar y en qué ha quedado cada punto._

## Corregidas

1. **Una reserva cancelada seguía ofreciendo subir el Calendario.** Ahora los documentos de una reserva cancelada solo se pueden consultar: sin «Subir», «Firmar», «Generar» ni acción pendiente (`reservaDocumentos` en `documentosWorkflow.js`). Comprobado en el navegador con la reserva cancelada de la empresa de prueba A.
2. **Casilla «El alumno trabajará en la dirección fiscal de la empresa».** La regla `.field > label` de `forms.css` anulaba su diseño. El `fieldset` ya no usa la clase `field`; la casilla vuelve a tener su espacio y el texto ya no sale en negrita. Captura `solicitud-empresa-puesto.png` rehecha.
3. **Pestaña «Tutores» del portal de empresa.** Hablaba de «Mis datos»; ahora dice «Datos de la empresa», que es el nombre real de la pestaña.
4. **No se podía rechazar ni reabrir la solicitud de una empresa.** Nuevo bloque «Estado de la solicitud» en la tarjeta de Empresas, para todo el personal: «Rechazar solicitud» (con motivo), «Reabrir solicitud» y «Validar solicitud» (solo si el convenio ya está validado).
5. **No había forma de restablecer la contraseña de un alumno ni del personal.** Ahora cualquier cuenta activa puede recuperarla con un enlace por correo («¿Has olvidado tu contraseña?», válido 30 minutos y de un solo uso). Además, Administración puede dar una contraseña temporal a alumnos y empresas desde la nueva pestaña «Cuenta» de sus tarjetas.
6. **Convocatorias solapadas.** El inicio de «2027/2028» pasa del 29/08/2027 al 01/09/2027 (con tu aprobación, desde la propia función «Editar» de la aplicación).

## Nuevo: dar de baja

_Desde el 27/10/2026, «Dar de baja», «Resetear contraseña» y los datos de la cuenta están en una pestaña «Cuenta» de cada tarjeta, junto a «Información» y «Reservas»._

«Dar de baja» y «Reactivar» para alumnos y empresas, solo Administración (manual, §5.9). Usa la migración `db/migrations/016_estado_baja.sql` (estado «BAJA», id 4), **aplicada en la base de datos de desarrollo el 27/10/2026**, con tu aprobación. Probado en vivo solo con ALUMNO PRUEBA (FASE 3), que no tenía reservas activas (no se canceló nada ni se envió ningún correo): la baja exige motivo, desactiva la cuenta (el alumno recibe «La cuenta está desactivada» al entrar), no se puede repetir y Coordinación recibe 403; «Reactivar» devuelve la solicitud a «Validada» y el alumno vuelve a entrar. La cancelación de reservas durante una baja solo está probada con las pruebas automáticas.

## Siguen abiertas (datos de prueba, no errores de la aplicación)

7. **No hay plantillas activas** en la base de datos de desarrollo (Convenio, Anexo II y Anexo III salen «Sin plantilla»), así que no se puede generar ningún documento. Hacen falta los DOCX oficiales del centro.
8. **Solicitudes validadas con documentos sin subir.** Varios alumnos de prueba están «Validada» con el CV o el Anexo DGA en «Pendiente de subir». Se crearon directamente como datos de prueba (`seedPruebas.js`); la aplicación normal no lo permite.

## Qué se comprobó y cómo

- **Navegador** (Chrome sin ventana, con las cuentas de prueba de `backend/.pruebas.local.json`): las capturas del manual, la reserva cancelada sin acciones, los bloques nuevos de Alumnos y Empresas, y la ventana «Dar de baja» abierta (solo consulta qué reservas se cancelarían). Aparte de la prueba de baja y reactivación de ALUMNO PRUEBA, no se ha rechazado ni restablecido nada en la base de datos.
- **Pruebas automáticas**: `backend/test/phase5.test.js` (7 pruebas de baja y reactivación) y el resto de pruebas de backend y frontend.
- **Solo en el código** (no probado en el navegador en esta revisión): validar o rechazar documentos y solicitudes, reabrir, generar y regenerar, firmar, confirmar, cancelar y reasignar reservas, cambio obligatorio de contraseña, reaplicación de empresas, cambios de datos y su aprobación, reducción de plazas, el bloqueo tras intentos fallidos, la caducidad de la sesión y el formulario con el plazo cerrado. El ciclo completo de una reserva se probó en el navegador en la fase 4 ([PHASE_4_REPORT.md](../PHASE_4_REPORT.md), §1).
