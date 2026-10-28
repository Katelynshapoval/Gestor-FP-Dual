# Comportamientos especiales: fallos, transacciones y servicios externos

> Volver al [índice](README.md). Modelo transaccional en [integridad y transacciones](../base-de-datos/integridad-y-transacciones.md#5-transacciones).

### El evento de auditoría no se puede escribir
- **Contexto**: cualquier transición con evento (reservas, baja, reducción de cupo, tutores, solicitudes, documentos, correcciones de datos de alumno).
- **Comportamiento** (desde la 018): el evento se escribe en la misma transacción que el cambio. Si falla, **se deshace todo** y la petición responde con error. Ya no existe `recordEventAfterCommit`: el historial no tiene huecos.
- **Referencia**: [`auditLog.js`](../../../backend/src/services/auditLog.js), [`db/transaction.js`](../../../backend/src/db/transaction.js). Probado con inyección de fallos en `test/db/stage2.db.test.js`.

### Interbloqueo o espera de bloqueo agotada
- **Dentro de `inTransaction`** (reservas, baja, reducción de cupo): un interbloqueo hace que InnoDB deshaga la transacción y `inTransaction` repite **toda** la operación con otra conexión, como mucho 2 veces. La espera agotada no se reintenta (la transacción sigue abierta y el conflicto puede seguir).
- **En el resto** o si los reintentos se agotan: `ER_LOCK_DEADLOCK` / `ER_LOCK_WAIT_TIMEOUT` → 409 `CONCURRENCIA` «Otra operación estaba modificando los mismos datos. Inténtalo de nuevo.».
- **Excepción**: en los servicios que relanzan errores sin `sendSqlError` (baja, reactivación, subida de plantillas) llega como 500.
- **Procedimiento llamado sin transacción** (`SQLSTATE 45001`): error de programación → 500.

### Errores SQL no mapeados
- **Comportamiento**: cualquier error que no sea `45000`, duplicado, interbloqueo, espera o `CHECK` → se registra con `console.error('DB error:')` y responde **500 `INTERNAL`**. Casos conocidos: FK inexistente (especialidad en alta de empresa), columna inexistente (backend nuevo sobre esquema antiguo).

### Excepciones fuera de `try`
- **Comportamiento**: errores en lecturas previas (antes de abrir la transacción) o en servicios sin `try/catch` llegan al manejador global de [`routes/index.js`](../../../backend/src/routes/index.js) → 500 `{"error":"Error interno del servidor."}` **sin `code`**. El frontend lo trata como `SERVER`.

### Errores de `multer`
- **Comportamiento**: fichero > 10 MB, campo inesperado o tipo distinto de PDF → **400** con el mensaje de `multer` (p. ej. «File too large») o «Solo se aceptan archivos PDF.» (manejador propio en `documentosRoute` y `solicitudesAlumnoRoute`). Desde SEC-008 el contenido también tiene que empezar por `%PDF-` (`requirePdfSignature` en [`middleware/pdfUpload.js`](../../../backend/src/middleware/pdfUpload.js)); un fichero renombrado a `.pdf` se rechaza con el mismo mensaje. La subida de plantillas usa otro `multer` sin filtro de tipo: el servicio comprueba la extensión y la firma ZIP del DOCX (SEC-012).

### El servidor de correo falla
- **Comportamiento**: los correos se envían después del commit y sin esperar la respuesta. `notificaciones.safe` captura cualquier error y lo registra («[notificación] …: no se pudo enviar.»); los correos directos (confirmación de solicitud, convenio, reducción de cupo) tienen su propio `try/catch`. **No hay cola ni reintento**: el correo se pierde. En modo `smtp` sin `EMAIL_USER/EMAIL_PASS`, `sendMail` lanza «El correo no está configurado» y se registra igual.
- **Consecuencias**: la operación de negocio nunca falla por el correo.
- **Referencia**: [`notificaciones.js`](../../../backend/src/services/notificaciones.js), [`mail/config.js`](../../../backend/src/mail/config.js).

### Modo de correo por defecto
- **Comportamiento**: sin `MAIL_MODE`, el modo es `smtp` solo si `NODE_ENV=production`; en cualquier otro caso `log` (no se envía nada; se escribe una línea con el destinatario enmascarado).
- **Consecuencias**: un despliegue real sin `NODE_ENV=production` ni `MAIL_MODE=smtp` **no envía ningún correo**, tampoco los de recuperación de contraseña. Lo advierte `backend/.env.example`.

### Generación de PDF: Chromium, plantilla o datos
- **Condición**: Chromium no arranca (no instalado por `puppeteer`, falta de memoria), plantilla DOCX con sintaxis errónea, datos inexistentes.
- **Comportamiento**: en `POST /documentos/generar` el error llega a `sendSqlError` → normalmente 500 (o el `status` del error: 400/404/409). En el alta y la reaplicación de empresa solo se registra en consola y la solicitud queda creada sin convenio. Se lanza **un navegador por documento** y se cierra en `finally`.
- **Consecuencias**: generaciones simultáneas multiplican el consumo de memoria.

### Ventanas entre comprobación y bloqueo
- **Comportamiento**: algunas comprobaciones de Node se hacen con lecturas simples antes del bloqueo para dar mensajes claros: `validateReservaTargets` (elegibilidad de reservas), `assertCanUpload` (estado del documento actual) y `missingStudentValidation`. En reservas, desde la 018 la elegibilidad, las plazas y las firmas de la confirmación se vuelven a comprobar **dentro** de la transacción y bajo bloqueo. Sigue sin repetirse bajo bloqueo el «documento validado no se reemplaza» (solo lo comprueba Node) 🔶.
- **Ejemplo**: el centro valida el anexo mientras la empresa sube uno nuevo; si la subida pasa la guarda justo antes de la validación, el fichero nuevo sustituye al validado y lo devuelve a PENDIENTE 🔶.

### Alta pública y datos a medio enviar
- **Comportamiento**: todas las inserciones del alta están en una transacción; una validación que falla a mitad (p. ej. oferta con cantidad 0, domicilio de trabajo incompleto) hace `ROLLBACK` y no deja empresa, contactos ni usuario.

### Reinicio del servidor
- **Comportamiento**: se pierden los contadores de los limitadores (login, recuperación y altas públicas); el programador sincroniza la convocatoria al arrancar. Las sesiones (JWT) sobreviven al reinicio mientras no cambien `JWT_SECRET` ni la contraseña del usuario.
