# Documentos y firmas

> Código: [`documentCatalogue.js`](../../../backend/src/services/documentCatalogue.js), [`documentosService.js`](../../../backend/src/services/documentosService.js), [`documentosStore.js`](../../../backend/src/services/documentosStore.js), [`documentosWorkflow.js`](../../../backend/src/services/documentosWorkflow.js), [`estadoReglas.js`](../../../backend/src/services/estadoReglas.js), [`documentGenerationService.js`](../../../backend/src/services/documentGenerationService.js), [`documentGenerationConfig.js`](../../../backend/src/services/documentGenerationConfig.js), [`plantillasService.js`](../../../backend/src/services/plantillasService.js), [`tiposDocumento.js`](../../../backend/src/services/tiposDocumento.js). Pruebas: `authorization.test.js`, `phase2.test.js`, `tiposDocumento.test.js`, `test/db/stage1.db.test.js`, `test/db/stage025.db.test.js`.

## 1. Catálogo

El catálogo de Node decide, por tipo de documento (`clave` = `dual_tipos_documento.nombre`):

| Clave | Padre (`ambito`) | Quién sube | Firmantes | Revisión | Generado | Reemplazable validado | Visibilidad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CV` | solicitud alumno | ALUMNO | — | Sí | No | No | Centro revisa; empresa **ve**; alumno sube |
| `ANEXO_DGA` | solicitud alumno | ALUMNO | — | Sí | No | No | Empresa **no lo ve** |
| `CONVENIO` | solicitud empresa | EMPRESA | **EMPRESA, GESTOR** (el centro desde la 027) | Sí | **Sí** | No | Alumno no lo ve: es un documento de empresa |
| `ANEXO_XIV` | solicitud empresa | EMPRESA | — | Sí | No | No | Alumno no lo ve |
| `ANEXO_G` | solicitud empresa | CENTRO | — | No | No | Sí | Solo el centro |
| `EXCEL` | solicitud empresa | CENTRO | — | No | No | Sí | Solo el centro |
| `ANEXO_II` | reserva (familia «contrato») | EMPRESA | EMPRESA, GESTOR, ALUMNO | Sí | **Sí** | No | Alumno lo ve |
| `ANEXO_III` | reserva (familia «beca») | EMPRESA | EMPRESA, GESTOR, ALUMNO | Sí | **Sí** | No | Alumno lo ve |
| `CALENDARIO` | reserva | EMPRESA, ADMINISTRADOR, COORDINADOR (`uploadRoles`) | EMPRESA, GESTOR, ALUMNO | **No** | No | Sí | Los tres firman |
| `FORMULARIO`, `ANEXO_2`, `ANEXO_H` | — | — | — | — | — | — | **Históricos** (`legacy`): ocultos, no validables; `ANEXO_H` aparece en el historial de la reserva |

`OTRO` existe en BD pero no en el catálogo de Node (no se puede subir ni listar).

Modos por actor (`actor`): `upload` (sube), `sign` (firma), `review` (revisa), `view` (ve), `hidden` (no se lista). ADMINISTRADOR y COORDINADOR se proyectan como `GESTOR`.

**Requisitos derivados**:
- Validar una solicitud de alumno exige `CV` y `ANEXO_DGA` validados (`requeridoParaValidarAlumno`).
- Validar una solicitud de empresa exige `CONVENIO` validado.
- Confirmar una reserva exige el `ANEXO_II` o `ANEXO_III` de su familia firmado por los tres y validado.
- Más los tipos **obligatorios añadidos por el centro** (§ 1.1).

### 1.1 Tipos añadidos por el centro (migración 025)

`dual_tipos_documento` guarda, para cada tipo, `nombre_mostrar`, `ambito`, `generado`, `firma_empresa/centro/alumno`, `requerido`, `familia_contrato`, `activo`, `es_sistema` y `orden`. Los 13 tipos de la tabla anterior son `es_sistema = 1`: sus reglas siguen en `CATALOGUE` y solo cambia su plantilla. Administración añade tipos en **Configuración › Documentos** (`/tipos-documento`, [`tiposDocumento.js`](../../../backend/src/services/tiposDocumento.js)); `customDef()` los convierte en definiciones del catálogo y `setCustomTypes()` las carga al arrancar y tras cada cambio.

| Regla | Tipo añadido |
| --- | --- |
| Generación | Siempre desde plantilla (`chk_tipos_documento_generado`); lo genera el centro |
| Revisión | Siempre la revisa el centro |
| Quién sube | El firmante empresa (o alumno, en su solicitud) puede subir la copia firmada cuando ya existe; antes ve «En preparación por el centro» |
| Visibilidad | Alumno: solicitud alumno y reserva. Empresa: solicitud empresa y reserva |
| Firmas | Las marcadas; el alumno no firma en la solicitud de empresa ni la empresa en la del alumno (CHECK y API) |
| Obligatorio | Solicitud alumno: bloquea validar al alumno. Solicitud empresa: bloquea validar la empresa (`missingCompanyValidation`; validar el último obligatorio valida la empresa, como el convenio). Reserva: debe estar firmado y validado para confirmar (`reservaConfirmable(…, extras)`, una línea por tipo en la lista de requisitos) |
| Familia | Solo reservas: todas, solo `beca` o solo `contrato`. Sin tipo de contrato solo aparecen los de «todas». Cambiar de familia se rechaza mientras haya un documento de la familia actual subido y no rechazado; los rechazados pasan al historial |
| Desactivar | Deja de pedirse; los documentos existentes se siguen listando y consultando |
| Editar | Nombre, firmas, obligatorio, familia y activo. El ámbito solo mientras no haya documentos. Auditado (`TIPO_DOCUMENTO`: `CREAR`, `EDITAR`, `ACTIVAR`, `DESACTIVAR`) |

Los triggers de `dual_documentos` comprueban el padre con `ambito` (antes, nombres escritos a mano).

### 1.2 Un convenio por empresa (migración 026)

[`conveniosEmpresa.js`](../../../backend/src/services/conveniosEmpresa.js). El convenio validado de una empresa cubre los ciclos de la solicitud a la que pertenece.

| Situación | Qué pasa |
| --- | --- |
| `reapply` con los **mismos ciclos** que el convenio vigente (último CONVENIO actual VALIDADO de otra solicitud de la empresa sin renovación abierta) | Copia `HEREDADO` en la solicitud nueva (fichero, estado VALIDADO y firmas; `id_documento_origen` = el original, también desde una copia). Evento `DOCUMENTO/HEREDAR`. Correo «solicitud recibida» con `convenio_vigente = sí` y sin adjunto. La solicitud se valida a mano (el convenio ya está validado) |
| `reapply` con **otros ciclos** | Renovación `CICLOS` en la solicitud nueva; tras el commit se genera el convenio (si hay plantilla) y va en «solicitud recibida»; aviso a Administración |
| `addEspecialidad` con convenio o renovación abierta | Renovación `CICLOS`: el convenio actual (validado o no) pasa a `es_actual = 0`; tras el commit, generación, `convenio_renovar_empresa` y `convenio_renovar_centro` |
| `POST /solicitudes/empresa/:id/convenio/sustituir { motivo }` (personal) | Renovación `MANUAL` con el motivo (≤ 300). Solo convocatoria activa, solicitud no rechazada ni de baja, con convenio y sin renovación abierta (409) |
| Validar un CONVENIO | Cierra la renovación abierta de su solicitud (`resuelta_en`, `id_documento_nuevo`) en la misma transacción |

`dual_convenio_renovaciones` guarda motivo, `detalle` en palabras, ciclos antes/ahora, convenio retirado y nuevo, usuario y fechas; como máximo una abierta por solicitud (columna generada única). Un segundo cambio antes de resolver se suma a la abierta. La solicitud de empresa **no cambia de estado** durante la renovación. `convenio_renovar_centro` va a cada ADMINISTRADOR activo con email, con `pasos` (LISTA) según lo hecho: generado, falta plantilla o falta generar. Panel: `contadores.convenios_por_renovar`; listas: `renovacion_convenio`, `convenio_heredado_de`; `GET /solicitudes/empresa/mia`: además `tiene_convenio` y `convenio_vigente { convocatoria, ciclos }` (aviso al reaplicar).

## 2. Estado operativo

`deriveDocumentState(def, fila, firmas)` combina fichero, revisión y firmas:

| Estado operativo | Condición | Pendiente de |
| --- | --- | --- |
| `PENDIENTE_GENERACION` | Sin fichero y el tipo es generable (si no hay plantilla activa: `falta_plantilla`). Para la empresa, el CONVENIO sin fichero se muestra como «En preparación por el centro», sin `falta_plantilla` y sin `puede_subir` | Centro |
| `PENDIENTE_SUBIDA` | Sin fichero y no generable | Quien sube (`primaryUploader`) |
| `VALIDADO` | Revisión VALIDADO | — |
| `RECHAZADO` | Revisión RECHAZADO | Quien sube («sustituir») |
| `PENDIENTE_FIRMA` | Faltan firmas aplicables | Cada firmante que falta |
| `PENDIENTE_VALIDACION` | Firmas completas y el tipo se revisa | Centro |
| `COMPLETO` | Firmas completas y el tipo no se revisa (p. ej. Calendario) | — |

Las firmas **aplican** si el tipo tiene firmantes, hay fichero y la fila no está exenta (`firmas_exentas_legacy = 1`). `projectItem` añade para el rol que mira: `puede_subir` (sin fichero), `puede_reemplazar` (con fichero y no validado, o tipo reemplazable), `puede_revisar` (centro y `PENDIENTE_VALIDACION`), `puede_firmar` (con fichero, su firma pendiente y no rechazado), `puede_generar` / `puede_regenerar` (centro, generable, plantilla activa), `requiere_accion_actual` y la procedencia («Subida», «Generado», «No registrado»).

## 3. Subir un documento

Endpoints (todos `multipart`, campo `archivo`, PDF ≤ 10 MB: tipo MIME `application/pdf` **y** contenido que empieza por `%PDF-`, comprobado por `requirePdfSignature` en [`middleware/pdfUpload.js`](../../../backend/src/middleware/pdfUpload.js), SEC-008):

| Endpoint | Roles | Documento |
| --- | --- | --- |
| `POST /documentos/alumno/:idSolicitud/:tipo` | Personal, ALUMNO | Tipo de ámbito solicitud de alumno (`cv`, `anexo-dga`…) |
| `POST /documentos/empresa/:idSolicitud/convenio` | Personal, EMPRESA | CONVENIO |
| `POST /documentos/reserva/:idReserva/anexo` | Personal, EMPRESA | El anexo de la **familia del tipo guardado** (sin tipo → 400) |
| `POST /documentos/subir { clave, id_solicitud_alumno | id_solicitud_empresa | id_reserva }` | Todos | Genérico (se usa para Calendario, Anexo XIV, Anexo G, Excel…) |

### 3.1 Guarda única — `assertCanUpload`
En este orden:
1. Tipo válido, no histórico → si no, 400.
2. El catálogo permite subir a ese rol (`canUpload`) → si no, **403**. Ejemplo: el centro **no** sube Anexo II/III (los revisa); sí sube Calendario, Anexo G y Excel.
3. El padre existe (404) y es del usuario: el alumno, su solicitud; la empresa, su solicitud o una reserva de su empresa (403).
4. Reserva: no CANCELADA (400); para anexos, el tipo de contrato debe estar indicado y su familia coincidir con la clave (400).
5. Si el documento actual está **VALIDADO** y el tipo no es reemplazable → 400 «Un documento validado no se puede reemplazar.»

No se comprueba la convocatoria ni el estado de la solicitud.

### 3.2 Guardado — `saveByClave` (una transacción)
1. `SELECT … FOR UPDATE` del **padre** (antes de cualquier otra lectura, para no fijar una instantánea antigua bajo REPEATABLE READ).
2. `CALL sp_guardar_documento`: si hay documento actual, copia la fila a `dual_documento_versiones` y la reemplaza (PENDIENTE, sin motivo); si no, inserta.
3. Procedencia: `estado_workflow` del catálogo, usuario, `origen_documento` (`SUBIDA`/`GENERADO`), plantilla, `registrado_en`, y `firmas_exentas_legacy = 0` (un fichero nuevo nunca está exento).
4. **Firmas**: para cada firmante del tipo, si el que sube es ese firmante y es una subida, `FIRMADO` con método **`SUBIDA_FIRMADA`** (declara que el fichero lleva su firma); el resto, `SIN_FIRMAR`. Un fichero **generado** queda sin ninguna firma.
5. Evento `SUBIR` o `GENERAR` (con `firma_declarada` si procede).

Consecuencias: cada fichero nuevo **reinicia la revisión y todas las firmas**; la versión anterior se archiva sin sus firmas. Ejemplo: la empresa sube el Anexo II → firma EMPRESA declarada, GESTOR y ALUMNO pendientes.

## 4. Firmar (migración 027)

> Código: [`firmasService.js`](../../../backend/src/services/firmasService.js) (firmas guardadas y sesiones de móvil), [`firmaPdf.js`](../../../backend/src/services/firmaPdf.js) (marcas y estampado), `documentosService.firmarDocumento`. Frontend: [`components/firma/`](../../../frontend/src/components/firma/). Pruebas: `backend/test/firmas.test.js`, `documentosFlujos.test.js`, `frontend/src/components/firma/firmas.test.jsx`. Plan: [`PLAN_FIRMAS.md`](../../PLAN_FIRMAS.md).

Firmar ya no es solo una anotación: **inserta en el PDF la imagen de la firma guardada** de quien firma.

### 4.1 Firmas guardadas — `dual_firmas`

| `titular` | De quién | Quién la cambia |
| --- | --- | --- |
| `USUARIO` | La firma propia de un alumno o de una empresa (`id_usuario` = su usuario) | Su dueño: «Mi firma», o la primera vez que firma. El alumno también puede dibujarla en el formulario público de solicitud (opcional) |
| `TUTOR` | La del tutor legal de un alumno **menor de 18 años**, guardada en la cuenta del alumno | El alumno (la dibuja el tutor en persona) |
| `CENTRO` | Una sola imagen con firma y sello, para todo el personal (`id_usuario` NULL) | Solo ADMINISTRADOR, en Configuración › Firma del centro |

- Una activa por titular y dueño (`uq_firmas_activa`). Cambiarla desactiva la fila anterior y crea otra: los documentos ya firmados conservan la imagen con la que se firmaron. Eliminarla vacía `imagen` y conserva la fila.
- Imagen: PNG comprobado por contenido (cabecera, tamaño en píxeles 60×20 a 2400×2400, ≤ 400 KB; la del centro ≤ 1 MB) y que `pdf-lib` puede incrustar.
- Solo se devuelve a su dueño (`GET /firmas/mia`); la del centro, al personal. Los eventos `FIRMA` (`CREAR`, `CAMBIAR`, `ELIMINAR`) nunca llevan la imagen.
- **Menor de edad**: `esMenor(fechaNacimiento)` en el momento de firmar. Sin fecha de nacimiento, cuenta como mayor.

### 4.2 Dónde va la firma

- Las plantillas tienen cuatro campos más: `<<firmaEmpresa>>`, `<<firmaCentro>>`, `<<firmaAlumno>>` y `<<firmaTutorLegal>>`. Al generar, cada uno se convierte en una caja vacía que enlaza a `https://firma.invalid/<MARCA>`; Chromium escribe los enlaces como anotaciones del PDF con su rectángulo exacto y `firmaPdf.leerMarcas` guarda página y rectángulo en `dual_documentos.firma_posiciones` (JSON) y quita la anotación.
- Al firmar, `firmaPdf.estampar` dibuja la imagen dentro de su rectángulo, sin deformarla. **Sin marca** (PDF subidos, plantillas sin el campo, documentos anteriores) la firma va en una **«Hoja de firmas»** añadida al final (título del documento, quién firma, fecha e imagen); `_hoja` en el mismo JSON recuerda la página y las plazas ocupadas.
- Documentos › Plantillas avisa cuando la plantilla activa de un tipo no tiene el campo de alguno de sus firmantes (`firmas_sin_marca`).
- Cualquier fichero nuevo (subida o regeneración) reinicia `firma_posiciones` junto con las firmas.

### 4.3 Firmar

`POST /documentos/:id/firmar`, `POST /documentos/firmar { clave, id_reserva }` o, para varios, **`POST /documentos/firmar-lote { ids }`** (hasta 200; cada documento en su propia transacción; la respuesta dice cuáles se firmaron y por qué falló cada uno de los demás).

Reglas (`documentoFirmable` + permisos), con el documento bloqueado:
- con fichero (404); tipo con firmantes (400 `SIN_FIRMA`); el rol del usuario es firmante (403 `ROL_NO_FIRMA`);
- versión actual (409 `VERSION_ANTERIOR`); reserva no cancelada (400); documento no RECHAZADO (400) ni **VALIDADO** (400 `VALIDADO`: firmar cambia el fichero);
- el usuario podría descargarlo (propiedad) → si no, 403;
- si ya estaba firmado por ese rol → **200 «La firma ya estaba registrada.»** sin cambios ni evento (idempotente);
- quien firma tiene su firma guardada → si no, **409** `SIN_FIRMA_GUARDADA`, `SIN_FIRMA_CENTRO` o `SIN_FIRMA_TUTOR` (alumno menor sin la firma de su tutor).

Efecto, en una transacción: el PDF sellado sustituye al fichero **en la misma fila** (las firmas de los demás no se reinician: el contenido es el mismo con una imagen más), `dual_documento_firmas` queda `FIRMADO` con método **`FIRMA_IMAGEN`**, `id_firma_imagen` y, si firma un menor, `id_firma_tutor`; evento `FIRMAR` con el método, la ubicación (`MARCA` u `HOJA`) y el SHA-256 del fichero antes y después. Un PDF que `pdf-lib` no puede abrir o cambiar (cifrado, dañado) conserva la firma como confirmación (`CONFIRMACION_APP`, `sin_imagen`).

`GET /documentos/pendientes-firma` devuelve lo que el usuario puede firmar ahora, con sus propias marcas, para la pantalla **«Firmar documentos»** (última página o página de la marca, flechas, una sola confirmación para todos).

Es una **firma electrónica simple** (una firma manuscrita digitalizada), no criptográfica: la prueba es el registro (cuenta, fecha, imagen usada y huella del fichero). El centro sigue revisando el documento antes de validarlo.

### 4.4 Firmar con el móvil — `dual_firma_sesiones`

El ordenador abre una sesión (`POST /firmas/sesiones`, pública y limitada a 20 por IP cada 15 min y 300 abiertas) y muestra un QR con `/firma-movil#<token>`. El móvil, sin iniciar sesión, envía **un** dibujo (`POST /firmas/sesiones/movil`, cabecera `X-Firma-Token`); el ordenador lo lee con su propia clave (`GET /firmas/sesiones/:id`, `X-Firma-Lectura`) y solo al aceptarlo se guarda con `PUT /firmas/mia`. La sesión es un relevo: no pertenece a ninguna cuenta, no firma nada, dura 10 minutos, sirve una vez y solo se guardan los SHA-256 de los dos secretos. Con la aplicación abierta en `localhost` no se ofrece el QR (el móvil no puede abrir esa dirección).

### 4.5 El centro firma el convenio

Desde la 027 el convenio lo firman la empresa y el centro. Los convenios **validados antes** no tienen fila de firma del centro y siguen siendo válidos (`signersAddedLater` en el catálogo: en un documento validado no se debe la firma de un firmante añadido después).

## 5. Validar y rechazar (personal)

### `POST /documentos/:id/validar`
Con el documento bloqueado, `documentoValidable` exige: documento existente (404); tipo actual que se revisa (400 `TIPO_NO_VALIDABLE` / `SIN_REVISION`); versión actual (409); con fichero (400); reserva no cancelada (400); no VALIDADO ya (409 `YA_VALIDADO`); no RECHAZADO (400: debe sustituirse antes); **todas las firmas aplicables** (400 `FIRMAS_PENDIENTES` con los que faltan).

Efecto: `sp_validar_documento` + evento. Si es un **CONVENIO** y la solicitud de empresa está **PENDIENTE**, en la misma transacción valida también la solicitud (`sp_validar_solicitud_empresa`, que además exige ≥ 1 oferta) y avisa a la empresa.

### `POST /documentos/:id/rechazar { motivo }`
`documentoRechazable`: existe, versión actual, con fichero, reserva no cancelada, no RECHAZADO ya. **Se puede rechazar un documento VALIDADO** (también el anexo de una reserva confirmada o el CV de un alumno validado), sin efecto sobre la solicitud o la reserva. Evento con motivo; correo a quien debe sustituirlo (alumno, coordinador de la empresa o, en reservas, coordinador de la empresa).

## 6. Generar desde plantilla — `POST /documentos/generar { clave, id_solicitud_alumno | id_solicitud_empresa | id_reserva, regenerar? }` (personal)

1. La clave debe ser generable (CONVENIO, ANEXO_II, ANEXO_III y los tipos añadidos por el centro) → si no, 400.
2. Reserva: existe, no CANCELADA, y la clave corresponde a la familia del tipo guardado.
3. Plantilla activa del tipo → si no, **409 `SIN_PLANTILLA`**.
4. Ya hay fichero y no se pidió `regenerar` → 409; ya está VALIDADO → 400.
5. Datos (`documentGenerationConfig`), **por ámbito**, iguales para todos los tipos de ese ámbito: solicitud de empresa = los del convenio (razón social, representante, DNI, domicilio legal, CIF, cargo, códigos de ciclos, fecha, convocatoria, email del coordinador); reserva = los de los anexos (alumno, DNI, empresa, CIF, ciclo, código, tipo de contrato, convocatoria, tutor con email y teléfono, fecha); solicitud de alumno = alumno, DNI, email, teléfono, domicilio, ciclo, código, convocatoria y fecha. La pestaña Plantillas los muestra tal como se escriben (`<<razonSocial>>`).
6. `docx-templates` (delimitadores `<<` `>>`) → `mammoth` (HTML) → `puppeteer` (PDF A4, márgenes 2 cm). **Se lanza un Chromium por generación.** Desde SEC-004 cada comando `<<…>>` solo puede ser un **nombre de variable** (`razonSocial`, `$fila.codigo`): se resuelve con `resolveTemplateVariable` y nunca se ejecuta como JavaScript; cualquier otra cosa da error. Chromium genera el PDF con JavaScript desactivado y sin red (solo se permiten recursos `data:`).
7. `firmaPdf.leerMarcas` lee del PDF dónde va cada firma (§ 4.2).
8. `saveByClave` con origen `GENERADO` (sin firmas) y esas posiciones.

El PDF refleja los datos **del momento**: cambios posteriores (tutor, datos de empresa) no se aplican hasta regenerar, y solo puede regenerarse mientras no esté validado.

## 7. Plantillas (`/documentos/plantillas`)

- Listar y descargar: personal. Subir: **solo ADMINISTRADOR** (las plantillas ya no ejecutan código, pero definen el contenido legal de los documentos).
- Subida: clave generable, fichero `.docx` (extensión, MIME DOCX, `application/zip` u `octet-stream`, **y** firma ZIP en los primeros bytes, SEC-012), ≤ 10 MB. El nombre original se limpia y solo se muestra en las listas. En transacción: siguiente `version`, desactiva la anterior e inserta la nueva activa.
- Descarga: el servidor fija el tipo DOCX y el nombre `plantilla-<clave>-v<versión>.docx` (SEC-012), como `attachment`.
- No hay borrado ni reactivación de versiones antiguas (se vuelve a subir el fichero). Las plantillas de `backend/required_documents/` son de referencia; el código no las lee 🔶.

## 8. Descargar — `GET /documentos/:id/descargar`

| Rol | Puede descargar |
| --- | --- |
| Personal | Cualquier documento |
| EMPRESA | Documentos de sus solicitudes y de reservas de su empresa; además el **CV** (tipos visibles para empresa) de un alumno si tiene con él una reserva no cancelada, o si el alumno es candidato visible (VALIDADO, convocatoria activa, ciclo de sus ofertas VALIDADO, sin confirmada) |
| ALUMNO | Documentos visibles para alumno de su solicitud y de sus reservas. Nunca los de la solicitud de empresa (convenio, Anexo XIV) |

Respuesta `application/pdf`, `Content-Disposition: attachment; filename="documento_<id>.pdf"` (SEC-008: una visita directa a la URL no lo abre en el origen de la API). El visor de la aplicación lo pide como *blob* y lo muestra igual. Sin fichero → 404.

## 9. Listas por rol

| Endpoint | Contenido |
| --- | --- |
| `GET /documentos/alumno/mios` | De la solicitud **más reciente** del alumno: CV y Anexo DGA; por cada reserva no cancelada, el anexo de su familia y el calendario (el convenio no: es de la empresa) |
| `GET /documentos/empresa` | Por cada solicitud de la empresa: convenio y Anexo XIV; por cada reserva no cancelada: anexo y calendario |
| `GET /documentos/seguimiento` | Ver [panel y seguimiento](panel-y-seguimiento.md) |

Todas usan `projectItem`, de modo que el estado y las acciones coinciden en cada pantalla.
