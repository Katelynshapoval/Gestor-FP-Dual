# Comportamientos especiales: documentos y firmas

> Volver al [índice](README.md). Flujo normal en [documentos y firmas](../logica-de-negocio/documentos-y-firmas.md).

### Cada fichero nuevo reinicia revisión y firmas
- **Contexto**: `documentosStore.saveByClave` (todas las subidas y generaciones).
- **Comportamiento**: el documento vuelve a PENDIENTE sin motivo; todas las firmas pasan a `SIN_FIRMAR` salvo la del que sube si es firmante; el fichero anterior no se guarda (desde la 028).
- **Motivo**: «Signatures belong to a file: a new file starts unsigned» (comentario); impide que firmas antiguas validen un fichero nuevo.
- **Consecuencias**: se pierde quién firmó la versión anterior. Sustituir un Anexo firmado por dos partes obliga a recoger otra vez las tres firmas.

### Firma declarada al subir
- **Condición**: quien sube un documento con firmantes es uno de ellos (empresa que sube Anexo II/III, Convenio o Calendario; centro que sube Calendario).
- **Comportamiento**: su firma queda `FIRMADO` con método `SUBIDA_FIRMADA` («Declarada al subir el documento firmado»).
- **Ejemplo**: la empresa sube el convenio firmado → como el único firmante es EMPRESA, queda directamente «Pendiente de validar».

### Documentos generados sin firmas
- **Comportamiento**: un convenio o anexo **generado** por el centro empieza con todas las firmas pendientes (el centro no queda como firmante por generar). El centro debe pulsar «Firmar» como GESTOR igual que el resto.

### Exención heredada de firmas
- **Condición**: documentos marcados con `firmas_exentas_legacy = 1` por la migración 013 (6 convenios en desarrollo).
- **Comportamiento**: no se les exigen ni muestran firmas; al validar, el evento lo indica. **Cualquier fichero nuevo** sobre ese documento elimina la exención.
- **Referencia**: migración 013, `documentCatalogue.signatureApplies`.

### La firma cambia el fichero (migración 027)
- **Comportamiento**: firmar inserta la imagen en el PDF y lo guarda en la misma fila, sin archivar versión ni reiniciar las firmas de los demás. La huella del fichero antes y después queda en el evento `FIRMAR`.
- **Consecuencias**: un documento VALIDADO ya no se puede firmar (400 `VALIDADO`). Las firmas hechas antes de la 027 (`CONFIRMACION_APP`, sin imagen) siguen valiendo y no se re-estampan.

### Documento sin marcas de firma
- **Condición**: PDF subido (Calendario, un anexo escaneado), plantilla sin el campo de ese firmante, o documento generado antes de la 027.
- **Comportamiento**: la firma va en una «Hoja de firmas» añadida al final; las siguientes firmas ocupan la plaza siguiente de la misma hoja.
- **Ejemplo**: la empresa sube el anexo firmado a mano y escaneado → firma EMPRESA declarada; alumno y centro firman en la hoja.

### PDF que no admite la imagen
- **Condición**: fichero cifrado o dañado que `pdf-lib` no abre.
- **Comportamiento**: la firma se registra como confirmación (`CONFIRMACION_APP`), sin tocar el fichero, y el mensaje lo dice.

### Alumno menor de edad
- **Comportamiento**: al firmar se insertan su firma y la de su tutor legal (guardada en su cuenta). Sin la del tutor → 409 `SIN_FIRMA_TUTOR`. Al cumplir 18 deja de pedirse; la firma del tutor guardada se puede eliminar.
- **Límite**: la aplicación no comprueba quién dibuja la firma del tutor.

### Convenios validados antes de que firmara el centro
- **Comportamiento**: siguen validados y no muestran una firma del centro pendiente. Un convenio todavía sin validar sí necesita la firma del centro antes de validarse.

### Firmar varios a la vez
- **Comportamiento**: `firmar-lote` firma uno a uno; un fallo (rechazado, versión anterior, otra persona acaba de firmarlo) no detiene los demás y se devuelve con su motivo. Sin firma guardada no se firma ninguno (409).

### Firma repetida
- **Comportamiento**: firmar algo ya firmado por el mismo rol devuelve 200 «La firma ya estaba registrada.» sin cambios ni evento.
- **Consecuencias**: el personal es un único firmante «GESTOR»: si un coordinador firma, otro administrador ya no puede firmar «de nuevo».

### Firmar un documento rechazado o de una versión anterior
- **Comportamiento**: rechazado → 400 (hay que sustituirlo); versión anterior → 409 `VERSION_ANTERIOR`; reserva cancelada → 400.

### Validar sin todas las firmas, o un rechazado
- **Comportamiento**: 400 `FIRMAS_PENDIENTES` con la lista («empresa, centro, alumno»), sin tocar la fila. Un documento RECHAZADO no se puede validar directamente: debe subirse otro fichero.

### Rechazar un documento ya validado
- **Condición**: el centro rechaza un CV/Anexo DGA de un alumno VALIDADO, el convenio de una empresa VALIDADO o el anexo de una reserva CONFIRMADA.
- **Comportamiento**: se permite. El documento pasa a RECHAZADO y se avisa a quien debe sustituirlo, pero **la solicitud o la reserva no cambian de estado** (siguen validadas o confirmadas).
- **Consecuencias**: puede existir una reserva CONFIRMADA cuyo anexo está RECHAZADO; el frontend lo trata explícitamente (prueba «a confirmed reservation whose annex is not validated does not show a validated annex»).

### Sustituir un documento validado
- **Comportamiento**: prohibido (400) salvo en tipos `replaceIfValidated`: **Anexo G, Excel y Calendario**. En ellos, subir un fichero nuevo los devuelve a pendiente y reinicia firmas.

### Documentos de reservas canceladas
- **Comportamiento**: no se puede subir, generar, firmar, validar ni rechazar (400). La ficha los muestra **solo para consulta**, sin acción pendiente.
- **Referencia**: `assertCanUpload`, `estadoReglas`, `documentosWorkflow.soloConsulta`.

### Anexo de la familia equivocada
- **Comportamiento**: subir o generar el Anexo II en una reserva de beca (o al revés) → 400 «Para el tipo de contrato de esta reserva corresponde el Anexo III.». Sin tipo de contrato → 400 «El anexo II o III aparece cuando el centro indica el tipo de contrato.».

### Generar o regenerar
- **Comportamiento**: sin plantilla activa → 409 `SIN_PLANTILLA`; ya hay fichero y no se pide `regenerar: true` → 409; documento VALIDADO → 400. Al regenerar se archiva el anterior y se reinician las firmas.
- **Consecuencias**: el PDF fija los datos del momento (tutor, datos de empresa). Para reflejar cambios posteriores hay que regenerar antes de validar. Generar o regenerar un CONVENIO envía a la empresa «Tu convenio está disponible» con el PDF (sin esperar el envío; un fallo del correo no cambia la respuesta).

### Generar convenios pendientes
- **Condición**: plantilla activa de CONVENIO y solicitudes de empresa de la convocatoria activa (no rechazadas) sin fichero de convenio actual.
- **Comportamiento**: `POST /documentos/convenios/generar-pendientes` las genera **una a una** con `regenerar: false` y envía cada convenio por correo. Un convenio ya subido o generado no se toca; si otro proceso lo crea entre la consulta y la generación, `generateDocument` responde 409 y queda en `fallidos`. Un error en una empresa no detiene las demás. Una segunda ejecución mientras hay otra en curso → 409 (bloqueo en memoria, un solo proceso).
- **Consecuencias**: se ejecuta dentro de la petición HTTP; con muchas solicitudes puede tardar (un Chromium por convenio). Si se cambia la plantilla durante la ejecución, cada convenio usa la activa en su momento.

### El alumno no ve el convenio
- **Comportamiento**: el convenio (y el Anexo XIV) son documentos de la empresa. `CONVENIO` tiene `actor.ALUMNO: "hidden"`, `/documentos/alumno/mios` no lo lista y `alumnoMayDownload` rechaza cualquier documento de una solicitud de empresa, aunque el alumno tenga reservas con ella.
- **Motivo**: el convenio es un acuerdo entre la empresa y el centro; el alumno firma su anexo, no el convenio.

### La empresa ve el CV de candidatos, no su Anexo DGA
- **Comportamiento**: `empresaMayViewStudentDocument` solo permite tipos con `actor.EMPRESA` visible (CV) y solo de alumnos con reserva activa con la empresa o candidatos visibles en ese momento (VALIDADO, convocatoria activa, ciclo de sus ofertas validadas, sin confirmada). Un candidato confirmado en otra empresa deja de ser descargable.

### Fichero que no es un PDF de verdad
- **Comportamiento** (SEC-008): además del tipo MIME declarado, el contenido tiene que empezar por `%PDF-`; si no, 400 «Solo se aceptan archivos PDF.». No se analiza el resto del fichero. Las descargas se sirven como `application/pdf` `attachment`.
- **Referencia**: [`middleware/pdfUpload.js`](../../../backend/src/middleware/pdfUpload.js).

### Subidas simultáneas del mismo documento
- **Comportamiento**: se serializan por el bloqueo del padre; el segundo fichero sustituye al primero (que queda en versiones). Si dos transacciones llegaran a insertar a la vez, `uq_dd_actual` lo impide → 409 `DOCUMENTO_CONCURRENTE` «Este documento se acaba de guardar desde otra sesión…».
- **Referencia**: migración 017.

### Documentos del alta pública sin evento de subida
- **Comportamiento**: CV y Anexo DGA del formulario se guardan llamando al procedimiento directamente: tienen procedencia (`SUBIDA`, usuario, fecha) pero **no** evento `SUBIR` en `dual_eventos`. Las sustituciones posteriores sí lo tienen.

### Plantilla subida dos veces a la vez
- **Comportamiento**: ambas calculan la misma versión; la segunda falla por `uq_plantilla_tipo_version` y responde **409 `PLANTILLA_CONCURRENTE`**; no se guarda nada de ella.

### Validar un convenio con la empresa ya validada o rechazada
- **Comportamiento**: se valida solo el documento; la cascada a la solicitud de empresa ocurre únicamente si estaba **PENDIENTE**.
