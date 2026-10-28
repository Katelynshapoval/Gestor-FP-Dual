# Comportamientos especiales: documentos y firmas

> Volver al [índice](README.md). Flujo normal en [documentos y firmas](../logica-de-negocio/documentos-y-firmas.md).

### Cada fichero nuevo reinicia revisión y firmas
- **Contexto**: `documentosStore.saveByClave` (todas las subidas y generaciones).
- **Comportamiento**: el documento vuelve a PENDIENTE sin motivo; todas las firmas pasan a `SIN_FIRMAR` salvo la del que sube si es firmante; el fichero anterior se archiva en `dual_documento_versiones` **sin** sus firmas.
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
- **Consecuencias**: el PDF fija los datos del momento (tutor, datos de empresa). Para reflejar cambios posteriores hay que regenerar antes de validar.

### El alumno puede descargar el convenio de empresas con reservas canceladas
- **Comportamiento**: `alumnoMayDownload` permite el convenio de una solicitud de empresa si el alumno tiene **cualquier** reserva con ella, incluso cancelada. La lista `/documentos/alumno/mios`, en cambio, solo incluye empresas con reservas no canceladas.
- **Motivo**: no documentado.

### La empresa ve el CV de candidatos, no su Anexo DGA
- **Comportamiento**: `empresaMayViewStudentDocument` solo permite tipos con `actor.EMPRESA` visible (CV) y solo de alumnos con reserva activa con la empresa o candidatos visibles en ese momento (VALIDADO, convocatoria activa, ciclo de sus ofertas validadas, sin confirmada). Un candidato confirmado en otra empresa deja de ser descargable.

### Tipo MIME declarado por el cliente
- **Comportamiento**: `multer` acepta el fichero si el cliente declara `application/pdf`; no se inspecciona el contenido. Las descargas se sirven siempre como `application/pdf` `inline`.
- **Consecuencias**: la verificación del contenido y las cabeceras de descarga están planificadas.

### Subidas simultáneas del mismo documento
- **Comportamiento**: se serializan por el bloqueo del padre; el segundo fichero sustituye al primero (que queda en versiones). Si dos transacciones llegaran a insertar a la vez, `uq_dd_actual` lo impide → 409 `DOCUMENTO_CONCURRENTE` «Este documento se acaba de guardar desde otra sesión…».
- **Referencia**: migración 017.

### Documentos del alta pública sin evento de subida
- **Comportamiento**: CV y Anexo DGA del formulario se guardan llamando al procedimiento directamente: tienen procedencia (`SUBIDA`, usuario, fecha) pero **no** evento `SUBIR` en `dual_eventos`. Las sustituciones posteriores sí lo tienen.

### Plantilla subida dos veces a la vez
- **Comportamiento**: ambas calculan la misma versión; la segunda falla por `uq_plantilla_tipo_version` y, como `plantillasService.upload` relanza el error, responde **500** 🔶.

### Validar un convenio con la empresa ya validada o rechazada
- **Comportamiento**: se valida solo el documento; la cascada a la solicitud de empresa ocurre únicamente si estaba **PENDIENTE**.
