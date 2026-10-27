# Incidencias detectadas al redactar el manual

_27/10/2026 · rama `phase-5-design-polish`. Revisión de documentación: **no se ha cambiado nada de la aplicación**. Cada punto indica cómo se detectó._

## Errores de la interfaz

1. **Una reserva cancelada sigue ofreciendo subir el Calendario.** En el panel de una reserva **Cancelada**, el texto dice «La reserva está cancelada: sus documentos solo se pueden consultar», pero el Calendario aparece como «Pendiente de la empresa: subir Calendario» con el cuadro «Seleccionar PDF de Calendario» y el botón «Subir». El servidor rechaza esa subida, así que el error está en lo que se muestra. Visto en el portal de la empresa de prueba A. _(Navegador.)_
2. **Casilla «El alumno trabajará en la dirección fiscal de la empresa» (formulario de empresa, paso 4).** La casilla vuelve a quedar pegada al texto, y el texto sale en negrita. La regla `.field > label` (`display: block`, `font-semibold`) de `styles/forms.css` anula las clases de esa etiqueta, que es hija directa del `fieldset.field`. Afecta al cambio de diseño n.º 1 de esta misma rama. _(Captura `solicitud-empresa-puesto.png`.)_
3. **Nombre de pestaña equivocado en «Tutores» (portal de empresa).** El texto dice «El acceso al portal sigue siendo el CIF, en Mis datos» y «Para cambiar sus datos usa «Mis datos › Editar datos»», pero la pestaña se llama **«Datos de la empresa»**. _(Código: `pages/CompanyView/TutoresEmpresa.jsx`.)_

## Funciones que faltan en la interfaz (el servidor sí las tiene)

4. **El personal no puede rechazar ni reabrir la solicitud de una empresa desde la aplicación.** Existen `POST /solicitudes/empresa/:id/rechazar` y `/reabrir`, pero ninguna pantalla los usa. Rechazar el convenio no cambia el estado de la solicitud. Por eso el manual no explica cómo rechazar una empresa. _(Código.)_
5. **No hay pantalla para restablecer la contraseña de un alumno ni del personal.** «Resetear contraseña» solo aparece en las tarjetas de empresa. La pantalla de acceso dice «Si olvidaste tu contraseña, contacta con el administrador», pero Administración no tiene cómo hacerlo para un alumno. _(Código.)_

## Datos de prueba (no son errores de la aplicación)

6. **No hay plantillas activas** en la base de datos de desarrollo (Convenio, Anexo II y Anexo III salen «Sin plantilla»), así que no se puede generar ningún documento. Por eso hay convenios en «Pendiente de generar».
7. **Solicitudes validadas con documentos sin subir.** Varios alumnos de prueba están «Validada» con el CV o el Anexo DGA en «Pendiente de subir», algo que la aplicación normal no permite. Se crearon directamente como datos de prueba (`seedPruebas.js`). Aparecen en las capturas `alumno-detalle.png` y `portal-alumno.png`; el manual avisa al principio de que las capturas usan datos de prueba.
8. **Convocatorias que se solapan.** «2027/2028» empieza el 29/08/2027 y «2026/2027» termina el 31/08/2027. La aplicación ya no permite crear convocatorias que se solapen; estas vienen de datos anteriores. Conviene corregir las fechas antes de agosto de 2027.

## Qué se comprobó y cómo

- **Navegador** (Chrome sin ventana, con las cuentas de prueba de `backend/.pruebas.local.json`, solo consultando): todas las pantallas de las 31 capturas, los menús de cada perfil, los botones que se ven en ellas y el recorrido del formulario de empresa hasta «Revisión y envío» sin enviarlo. No se envió, validó, firmó ni modificó nada.
- **Solo en el código** (no probado en el navegador en esta revisión): validar o rechazar documentos y solicitudes, reabrir, generar y regenerar, firmar, confirmar, cancelar y reasignar reservas, cambio obligatorio de contraseña, reaplicación de empresas, cambios de datos y su aprobación, reducción de plazas, el bloqueo tras intentos fallidos, la caducidad de la sesión y el formulario con el plazo cerrado. El ciclo completo de una reserva (tipo de contrato, anexo, firmas, validación, confirmación y reasignación) sí se probó en el navegador en la fase 4 ([PHASE_4_REPORT.md](../PHASE_4_REPORT.md), §1). El resto se describe según el código actual.
- **Correos:** el manual no promete correos concretos. En desarrollo el envío está desactivado por defecto (`MAIL_MODE=log`).
