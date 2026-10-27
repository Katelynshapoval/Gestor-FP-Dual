# Capturas pendientes del manual de usuario

El [manual](../MANUAL_DE_USUARIO.md) ya incluye 34 capturas reales, hechas el 27/10/2026 con las cuentas y los datos de prueba de la base de datos de desarrollo. Las de esta lista no se pudieron hacer **sin modificar datos**: hacen falta reservas, documentos o cuentas en un estado que los datos de prueba no tienen, o un archivo PDF que se pueda mostrar.

El manual ya se entiende sin ellas. Para añadir una:

1. Guárdala en `docs/manual/imagenes/` con el nombre indicado (PNG, unos 1280 px de ancho).
2. Pega la línea «Markdown para insertar» en el apartado indicado, debajo de los pasos que ilustra.

**Antes de hacerlas:** usa solo datos de prueba (sin alumnos ni empresas reales), no muestres contraseñas y cierra los avisos que tapen la pantalla.

---

## 1. `visor-documento.png` — Esencial

- **Apartado:** 5.6 Documentos: seguimiento → «Tarea habitual: revisar lo que espera al centro» (y 3 · Botones y ventanas habituales)
- **Rol:** Coordinación o Administración
- **Dónde:** Documentos › Seguimiento → filtro «Estado: Pendiente de validar» → botón «Ver» de un documento
- **Qué mostrar:** el visor abierto con el PDF **visible**, la etiqueta «Pendiente de validar», los botones «Rechazar» y «Validar» y, arriba, «Descargar» y «Nueva pestaña».
- **Datos necesarios:** un documento de prueba con un PDF real. En el intento automático, el PDF del CV de prueba no se pudo mostrar («Failed to load PDF document»).
- **Pie de imagen:** «Visor de documentos con las acciones de revisión del centro.»
- **Markdown para insertar:** `![Visor de un PDF con los botones Rechazar y Validar](manual/imagenes/visor-documento.png)`

## 2. `reserva-anexo-firmas.png` — Esencial

- **Apartado:** 5.5 Reservas → «El panel de la reserva», pasos 3 a 5
- **Rol:** Coordinación o Administración
- **Dónde:** Reservas → grupo «Anexo pendiente de validar» (o «Anexo pendiente de firmas») → «Gestionar reserva»
- **Qué mostrar:** el panel con un tipo de contrato elegido; en «Documentos de la reserva», el Anexo II con la lista de firmas (Empresa, Alumno, Centro) y los botones «Firmar» / «Validar»; y la lista «Confirmación» con algunos puntos marcados.
- **Datos necesarios:** una reserva pendiente con tipo de contrato y el Anexo II subido. Los datos de prueba actuales no tienen ninguna en ese estado.
- **Pie de imagen:** «Anexo II con el estado de cada firma y la lista de requisitos para confirmar.»
- **Markdown para insertar:** `![Panel de reserva con el Anexo II, sus firmas y la lista de confirmación](manual/imagenes/reserva-anexo-firmas.png)`

## 3. `seleccion-tipo-contrato.png` — Opcional

- **Apartado:** 5.5 Reservas → «1. Indicar el tipo de contrato»
- **Rol:** Coordinación o Administración
- **Dónde:** Reservas → «Pendientes de tipo de contrato» → «Gestionar reserva» → desplegable «Tipo de contrato» abierto
- **Qué mostrar:** las opciones Beca, Contrato de formación en alternancia, Convenio y Otro.
- **Datos necesarios:** ninguno especial (hay reservas sin tipo). No se pudo capturar porque un desplegable abierto no sale en una captura automática. **No elijas ninguna opción**: se guarda al momento.
- **Pie de imagen:** «Selección del tipo de contrato antes de preparar el Anexo II o III.»
- **Markdown para insertar:** `![Desplegable Tipo de contrato abierto con sus cuatro opciones](manual/imagenes/seleccion-tipo-contrato.png)`

## 4. `alumno-firmar-anexo.png` — Esencial

- **Apartado:** 8.3 Mis reservas y firma del anexo → «Firmar el Anexo II o III»
- **Rol:** Alumno
- **Dónde:** Mi proceso Dual → «Mis reservas» → «Ver detalle y documentos» de una reserva pendiente
- **Qué mostrar:** el panel de la reserva con el Anexo II o III subido, la firma del alumno «Sin firmar» y el botón «Firmar».
- **Datos necesarios:** una reserva pendiente del alumno de prueba con el anexo subido por la empresa. El alumno de prueba solo tiene reservas canceladas.
- **Pie de imagen:** «El alumno abre el anexo, lo revisa y pulsa Firmar.»
- **Markdown para insertar:** `![Panel de la reserva visto por el alumno con el botón Firmar del anexo](manual/imagenes/alumno-firmar-anexo.png)`

## 5. `empresa-reserva-activa.png` — Esencial

- **Apartado:** 7.5 Alumnos disponibles y reservas → «Gestionar vuestras reservas» (y 7.6)
- **Rol:** Empresa
- **Dónde:** Mi empresa → «Reservas» → «Ver y gestionar» de una reserva **pendiente**
- **Qué mostrar:** tipo de contrato, el Anexo II/III con «Seleccionar PDF de Anexo II» y «Subir», el Calendario, el selector «Tutor de empresa» y «Cancelar reserva» abajo.
- **Datos necesarios:** una reserva pendiente de la empresa de prueba A con tipo de contrato. Ahora mismo solo tiene una reserva cancelada.
- **Pie de imagen:** «Panel de una reserva para la empresa: subir el anexo, elegir tutor o cancelar.»
- **Markdown para insertar:** `![Panel de una reserva pendiente visto por la empresa](manual/imagenes/empresa-reserva-activa.png)`

## 6. `cambio-contrasena-obligatorio.png` — Esencial

- **Apartado:** 2 · «Contraseña temporal (cambio obligatorio)»
- **Rol:** Empresa con contraseña restablecida por Administración
- **Dónde:** Acceder → entrar con la contraseña temporal
- **Qué mostrar:** la tarjeta «Cambiar contraseña — Debes establecer una nueva contraseña antes de continuar» con los campos vacíos y el botón «Establecer contraseña».
- **Datos necesarios:** restablecer la contraseña de una **empresa de prueba** («Resetear contraseña»). Esto cambia la contraseña en la base de datos: hazlo solo con una cuenta de prueba y actualiza `backend/.pruebas.local.json` si la usas para pruebas.
- **Pie de imagen:** «Cambio obligatorio tras entrar con una contraseña temporal.»
- **Markdown para insertar:** `![Pantalla de cambio obligatorio de contraseña](manual/imagenes/cambio-contrasena-obligatorio.png)`

## 7. `documento-rechazado.png` — Opcional

- **Apartado:** 9 · «Documentos rechazados o ya validados» (y 8.2)
- **Rol:** Alumno o Empresa
- **Dónde:** Mis documentos (alumno) o Documentos (empresa)
- **Qué mostrar:** un documento con la etiqueta «Rechazado», el recuadro «Motivo: …» y el botón «Reemplazar».
- **Datos necesarios:** un documento de prueba rechazado por el centro.
- **Pie de imagen:** «Documento rechazado con su motivo, listo para sustituirlo.»
- **Markdown para insertar:** `![Documento rechazado con el motivo y el botón Reemplazar](manual/imagenes/documento-rechazado.png)`

## 8. `empresa-cambios-pendientes.png` — Opcional

- **Apartado:** 7.2 Datos de la empresa y solicitud de cambios
- **Rol:** Empresa
- **Dónde:** Mi empresa → «Datos de la empresa», con una solicitud de cambios enviada
- **Qué mostrar:** el recuadro amarillo «Cambios enviados para revisión» con la lista de cambios y el botón «Modificar solicitud pendiente».
- **Datos necesarios:** una solicitud de cambios de prueba («Editar datos» → «Enviar para revisión»).
- **Pie de imagen:** «Cambios de datos a la espera de que el centro los apruebe.»
- **Markdown para insertar:** `![Cambios enviados para revisión en el portal de la empresa](manual/imagenes/empresa-cambios-pendientes.png)`

## 9. `aprobar-cambios-empresa.png` — Opcional

- **Apartado:** 5.4 Empresas → «Aprobar o rechazar cambios propuestos por la empresa»
- **Rol:** Coordinación o Administración
- **Dónde:** Empresas → filtro «Cambios de datos: Pendientes de revisión» → lápiz de la empresa
- **Qué mostrar:** la tabla «Actual → Solicitado» y los botones «Aprobar» y «Rechazar».
- **Datos necesarios:** la misma solicitud de cambios de la captura 8. **No pulses** «Aprobar» ni «Rechazar» si no quieres cambiar los datos.
- **Pie de imagen:** «Revisión por el centro de los cambios propuestos por una empresa.»
- **Markdown para insertar:** `![Tabla Actual y Solicitado con los botones Aprobar y Rechazar](manual/imagenes/aprobar-cambios-empresa.png)`

## 10. `empresa-reaplicar.png` — Opcional

- **Apartado:** 7.7 Participar en una nueva convocatoria
- **Rol:** Empresa
- **Dónde:** Mi empresa → «Datos de la empresa» → bloque «Participar en la nueva convocatoria» desplegado
- **Qué mostrar:** los campos del coordinador, la descripción del puesto, los ciclos con plazas y el botón «Enviar reaplicación».
- **Datos necesarios:** una empresa de prueba cuya última solicitud sea de una convocatoria anterior, con una convocatoria abierta. Las empresas de prueba ya participan en la activa.
- **Pie de imagen:** «Reaplicación de una empresa en una convocatoria nueva.»
- **Markdown para insertar:** `![Formulario Participar en la nueva convocatoria](manual/imagenes/empresa-reaplicar.png)`

## 11. `formulario-cerrado.png` — Opcional

- **Apartado:** 4 · «Comprobar si el plazo está abierto»
- **Rol:** Visitante
- **Dónde:** Solicitud de alumno o Solicitud de empresa, sin convocatoria activa
- **Qué mostrar:** el aviso «El plazo de solicitudes está cerrado.», el texto «Ahora no se pueden presentar solicitudes de…» y los botones «Acceder al portal» y «Volver al inicio».
- **Datos necesarios:** un momento sin convocatoria activa. No cambies las fechas de la convocatoria real para hacerla.
- **Pie de imagen:** «Formulario no disponible porque el plazo está cerrado.»
- **Markdown para insertar:** `![Formulario con el aviso de plazo cerrado](manual/imagenes/formulario-cerrado.png)`

## 12. `reducir-plazas.png` — Opcional

- **Apartado:** 7.3 Ciclos y plazas (y 5.4 Empresas → «Ciclos y plazas»)
- **Rol:** Empresa o personal del centro
- **Dónde:** al guardar un número de plazas menor que las reservas pendientes
- **Qué mostrar:** la ventana «Elegir reservas a cancelar» con la lista de alumnos y el botón «Reducir plazas».
- **Datos necesarios:** un ciclo de prueba con varias reservas pendientes. **Pulsa «Cancelar»** en la ventana para no cancelar reservas.
- **Pie de imagen:** «Al reducir plazas hay que elegir qué reservas pendientes se cancelan.»
- **Markdown para insertar:** `![Ventana Elegir reservas a cancelar](manual/imagenes/reducir-plazas.png)`

## 13. `resetear-contrasena.png` — Opcional

- **Apartado:** 5.4 Empresas → «Restablecer la contraseña de una empresa»
- **Rol:** Administración
- **Dónde:** Empresas → tarjeta de una empresa → «Credenciales de acceso»
- **Qué mostrar:** el bloque con el usuario (CIF) y el botón «Resetear contraseña». **Haz la captura antes de pulsarlo** y no muestres nunca una contraseña. (El equivalente del alumno ya está en `alumno-cuenta-baja.png`.)
- **Datos necesarios:** ninguno.
- **Pie de imagen:** «Solo Administración puede restablecer la contraseña de una empresa.»
- **Markdown para insertar:** `![Bloque Credenciales de acceso con el botón Resetear contraseña](manual/imagenes/resetear-contrasena.png)`

## 14. `reactivar.png` — Opcional

- **Apartado:** 5.9 Dar de baja → «Reactivar»
- **Rol:** Administración
- **Dónde:** Alumnos o Empresas → filtro «Solicitud: Dada de baja» → tarjeta desplegada
- **Qué mostrar:** el recuadro «Dada de baja el … Motivo: …», la etiqueta «Dada de baja» y el botón «Reactivar».
- **Datos necesarios:** aplicar la migración 016 y dar de baja una solicitud de prueba.
- **Pie de imagen:** «Una solicitud dada de baja, con su motivo y el botón Reactivar.»
- **Markdown para insertar:** `![Solicitud dada de baja con el botón Reactivar](manual/imagenes/reactivar.png)`
