# Documentos y firmas

> Código: [`documentCatalogue.js`](../../../backend/src/services/documentCatalogue.js), [`documentosService.js`](../../../backend/src/services/documentosService.js), [`documentosStore.js`](../../../backend/src/services/documentosStore.js), [`documentosWorkflow.js`](../../../backend/src/services/documentosWorkflow.js), [`estadoReglas.js`](../../../backend/src/services/estadoReglas.js), [`documentGenerationService.js`](../../../backend/src/services/documentGenerationService.js), [`documentGenerationConfig.js`](../../../backend/src/services/documentGenerationConfig.js), [`plantillasService.js`](../../../backend/src/services/plantillasService.js). Pruebas: `authorization.test.js`, `phase2.test.js`, `test/db/stage1.db.test.js`.

## 1. Catálogo

El catálogo de Node decide, por tipo de documento (`clave` = `dual_tipos_documento.nombre`):

| Clave | Padre (`ambito`) | Quién sube | Firmantes | Revisión | Generado | Reemplazable validado | Visibilidad |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CV` | solicitud alumno | ALUMNO | — | Sí | No | No | Centro revisa; empresa **ve**; alumno sube |
| `ANEXO_DGA` | solicitud alumno | ALUMNO | — | Sí | No | No | Empresa **no lo ve** |
| `CONVENIO` | solicitud empresa | EMPRESA | **EMPRESA** | Sí | **Sí** | No | Alumno lo ve (si tiene reserva con la empresa) |
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

## 2. Estado operativo

`deriveDocumentState(def, fila, firmas)` combina fichero, revisión y firmas:

| Estado operativo | Condición | Pendiente de |
| --- | --- | --- |
| `PENDIENTE_GENERACION` | Sin fichero y el tipo es generable (si no hay plantilla activa: `falta_plantilla`) | Centro |
| `PENDIENTE_SUBIDA` | Sin fichero y no generable | Quien sube (`primaryUploader`) |
| `VALIDADO` | Revisión VALIDADO | — |
| `RECHAZADO` | Revisión RECHAZADO | Quien sube («sustituir») |
| `PENDIENTE_FIRMA` | Faltan firmas aplicables | Cada firmante que falta |
| `PENDIENTE_VALIDACION` | Firmas completas y el tipo se revisa | Centro |
| `COMPLETO` | Firmas completas y el tipo no se revisa (p. ej. Calendario) | — |

Las firmas **aplican** si el tipo tiene firmantes, hay fichero y la fila no está exenta (`firmas_exentas_legacy = 1`). `projectItem` añade para el rol que mira: `puede_subir` (sin fichero), `puede_reemplazar` (con fichero y no validado, o tipo reemplazable), `puede_revisar` (centro y `PENDIENTE_VALIDACION`), `puede_firmar` (con fichero, su firma pendiente y no rechazado), `puede_generar` / `puede_regenerar` (centro, generable, plantilla activa), `requiere_accion_actual` y la procedencia («Subida», «Generado», «No registrado»).

## 3. Subir un documento

Endpoints (todos `multipart`, campo `archivo`, PDF ≤ 10 MB por tipo MIME):

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

## 4. Firmar

`POST /documentos/:id/firmar` o `POST /documentos/firmar { clave, id_reserva }` (este último busca el documento actual con fichero de esa reserva y tipo).

Reglas (`documentoFirmable` + permisos), con el documento bloqueado:
- con fichero (404); tipo con firmantes (400 `SIN_FIRMA`); el rol del usuario es firmante (403 `ROL_NO_FIRMA`);
- versión actual (409 `VERSION_ANTERIOR`); reserva no cancelada (400); documento no RECHAZADO (400);
- el usuario podría descargarlo (propiedad) → si no, 403;
- si ya estaba firmado por ese rol → **200 «La firma ya estaba registrada.»** sin cambios ni evento (idempotente).

Registra `FIRMADO`, `firmado_en`, `firmado_por`, método **`CONFIRMACION_APP`** y evento `FIRMAR`. **Ninguna firma es criptográfica**: el centro revisa el fichero antes de validar (la verificación de firmas PDF está planificada).

## 5. Validar y rechazar (personal)

### `POST /documentos/:id/validar`
Con el documento bloqueado, `documentoValidable` exige: documento existente (404); tipo actual que se revisa (400 `TIPO_NO_VALIDABLE` / `SIN_REVISION`); versión actual (409); con fichero (400); reserva no cancelada (400); no VALIDADO ya (409 `YA_VALIDADO`); no RECHAZADO (400: debe sustituirse antes); **todas las firmas aplicables** (400 `FIRMAS_PENDIENTES` con los que faltan).

Efecto: `sp_validar_documento` + evento. Si es un **CONVENIO** y la solicitud de empresa está **PENDIENTE**, en la misma transacción valida también la solicitud (`sp_validar_solicitud_empresa`, que además exige ≥ 1 oferta) y avisa a la empresa.

### `POST /documentos/:id/rechazar { motivo }`
`documentoRechazable`: existe, versión actual, con fichero, reserva no cancelada, no RECHAZADO ya. **Se puede rechazar un documento VALIDADO** (también el anexo de una reserva confirmada o el CV de un alumno validado), sin efecto sobre la solicitud o la reserva. Evento con motivo; correo a quien debe sustituirlo (alumno, coordinador de la empresa o, en reservas, coordinador de la empresa).

## 6. Generar desde plantilla — `POST /documentos/generar { clave, id_solicitud_empresa | id_reserva, regenerar? }` (personal)

1. La clave debe ser generable (CONVENIO, ANEXO_II, ANEXO_III) → si no, 400.
2. Reserva: existe, no CANCELADA, y la clave corresponde a la familia del tipo guardado.
3. Plantilla activa del tipo → si no, **409 `SIN_PLANTILLA`**.
4. Ya hay fichero y no se pidió `regenerar` → 409; ya está VALIDADO → 400.
5. Datos (`documentGenerationConfig`): convenio = razón social, representante, DNI, domicilio legal, CIF, cargo, códigos de ciclos, fecha, convocatoria; anexos = alumno, DNI, empresa, CIF, ciclo, tipo de contrato, convocatoria, tutor (nombre, email, teléfono) y fecha.
6. `docx-templates` (delimitadores `<<` `>>`) → `mammoth` (HTML) → `puppeteer` (PDF A4, márgenes 2 cm). **Se lanza un Chromium por generación.**
7. `saveByClave` con origen `GENERADO` (sin firmas).

El PDF refleja los datos **del momento**: cambios posteriores (tutor, datos de empresa) no se aplican hasta regenerar, y solo puede regenerarse mientras no esté validado.

## 7. Plantillas (`/documentos/plantillas`)

- Listar y descargar: personal. Subir: **solo ADMINISTRADOR**, porque `docx-templates` ejecuta expresiones contenidas en la plantilla.
- Subida: clave generable, fichero `.docx` (extensión **y** MIME DOCX, `application/zip` u `octet-stream`), ≤ 10 MB. En transacción: siguiente `version`, desactiva la anterior e inserta la nueva activa.
- No hay borrado ni reactivación de versiones antiguas (se vuelve a subir el fichero). Las plantillas de `backend/required_documents/` son de referencia; el código no las lee 🔶.

## 8. Descargar — `GET /documentos/:id/descargar`

| Rol | Puede descargar |
| --- | --- |
| Personal | Cualquier documento |
| EMPRESA | Documentos de sus solicitudes y de reservas de su empresa; además el **CV** (tipos visibles para empresa) de un alumno si tiene con él una reserva no cancelada, o si el alumno es candidato visible (VALIDADO, convocatoria activa, ciclo de sus ofertas VALIDADO, sin confirmada) |
| ALUMNO | Documentos visibles para alumno de su solicitud y de sus reservas; el **convenio** de una empresa con la que tenga **cualquier** reserva (incluidas canceladas) |

Respuesta `application/pdf`, `Content-Disposition: inline; filename="documento_<id>.pdf"`. Sin fichero → 404.

## 9. Listas por rol

| Endpoint | Contenido |
| --- | --- |
| `GET /documentos/alumno/mios` | De la solicitud **más reciente** del alumno: CV y Anexo DGA; por cada reserva no cancelada, el convenio de la empresa, el anexo de su familia y el calendario |
| `GET /documentos/empresa` | Por cada solicitud de la empresa: convenio y Anexo XIV; por cada reserva no cancelada: anexo y calendario |
| `GET /documentos/seguimiento` | Ver [panel y seguimiento](panel-y-seguimiento.md) |

Todas usan `projectItem`, de modo que el estado y las acciones coinciden en cada pantalla.
