# Modelo de datos

> Parte de la [base de datos](vision-general.md). Esquema de referencia: [`db/000_baseline.sql`](../../../db/000_baseline.sql) + [`db/migrations/012–017`](../../../db/migrations). Se describe el **estado tras la migración 017** (aplicada en desarrollo el 28/10/2026).
>
> Notación: **PK** clave primaria · **FK** clave foránea · **UQ** único · **NN** `NOT NULL` · 🔒 tabla protegida.

## 1. Convocatorias y catálogos

### `dual_convocatorias`
Curso académico del programa. Todo el proceso se agrupa por convocatoria.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id_convocatoria` | INT PK AI | |
| `nombre` | VARCHAR(20) NN **UQ** | p. ej. «2026/2027». Duplicado → 409 `DUPLICADO` |
| `fecha_inicio`, `fecha_fin` | DATE NN | `CHECK fecha_fin >= fecha_inicio` |
| `activa` | TINYINT(1) NN, por defecto 0 | **Derivado**: el backend lo recalcula según `CURDATE()` ([convocatorias](../logica-de-negocio/convocatorias.md)). Triggers `trg_convocatorias_bi/bu_una_activa`: como mucho una activa |

Uso: casi todas las consultas filtran por `c.activa = 1` para decidir qué se puede crear o editar. No hay endpoint de borrado.

### Catálogos con ids fijos
| Tabla | Filas (id → nombre) | Uso |
| --- | --- | --- |
| `dual_roles` | 1 ADMINISTRADOR · 2 COORDINADOR · 3 EMPRESA · 4 ALUMNO | `dual_usuarios.id_rol` |
| `dual_estados_validacion` | 1 PENDIENTE · 2 VALIDADO · 3 RECHAZADO · 4 BAJA (016) | Solicitudes y documentos |
| `dual_estados_reserva` | 1 PENDIENTE · 2 CONFIRMADA · 3 CANCELADA | Reservas |
| `dual_tipos_documento` | 1 CV · 2 ANEXO_2 · 3 CONVENIO · 4 ANEXO_H · 5 OTRO · 6 ANEXO_DGA · 7 FORMULARIO · 8 ANEXO_XIV · 9 ANEXO_G · 10 ANEXO_II · 11 ANEXO_III · 12 CALENDARIO · 13 EXCEL | `ANEXO_2`, `ANEXO_H`, `FORMULARIO`, `OTRO` son **históricos** (siguen referenciados por datos antiguos; el catálogo de Node los marca `legacy` u omite `OTRO`) |
| `dual_tipos_contrato` | 1 BECA · 2 CONTRATO_DE_FORMACION_EN_ALTERNANCIA · 3 CONVENIO · 4 OTRO (+ `nombre_mostrar`) | La familia de anexo se deduce del **nombre**: contiene «beca» → Anexo III; cualquier otro → Anexo II |
| `dual_transportes` | 1 A_PIE · 2 COCHE · 3 AUTOBUS · 4 TRANVIA · 5 TREN · 6 BICICLETA | Transportes por solicitud de empresa |

### `dual_especialidades`
Ciclos formativos. **No están en el baseline** (datos del centro).

| Columna | Notas |
| --- | --- |
| `id_especialidad` PK | |
| `codigo` VARCHAR(20), `turno` TINYINT (0 = DIURNO, 1 = VESPERTINO) | **UQ `(codigo, turno)`**: el mismo ciclo en dos turnos son dos especialidades |
| `nombre` | Texto visible |
| `activa` | `GET /especialidades` solo devuelve las activas; `addEspecialidad` exige activa. El alta de solicitudes **no** comprueba `activa` (solo que exista) |

### `dual_preferencias` y `dual_solicitud_preferencias`
Catálogo de preferencias por especialidad y elecciones del alumno (orden 1–3, PK `(id_solicitud_alumno, orden)`, `CHECK orden BETWEEN 1 AND 3`). **Únicas FK con `ON DELETE/UPDATE CASCADE`** del esquema. Catálogo vacío en desarrollo.

## 2. Alumnos

### 🔒 `gf_alumnosfct`
Persona alumno (identidad estable entre convocatorias).

| Columna | Notas |
| --- | --- |
| `idalumno` PK | |
| `dni` VARCHAR(15) NN **UQ** (`uq_gf_alumnosfct_dni`, migración 015) | Guardado **normalizado** (trim + mayúsculas). Login del alumno. La 015 exige que no haya duplicados ni valores sin normalizar |
| `nombre`, `domicilio`, `cp`, `localidad`, `telalumno`, `email` | NN. `email` es el correo personal al que llegan notificaciones y el enlace de recuperación |
| `telfamilia`, `observaciones` | |
| `especialidad` VARCHAR(20) | Código de la última especialidad solicitada (campo heredado mantenido en paralelo) |
| `id_especialidad_dual` INT FK → `dual_especialidades` | **Última** especialidad solicitada. Desde la 017 **no** es la fuente de verdad: lo es `dual_solicitudes_alumno.id_especialidad` |
| `nacionalidad`, `fechaNacimiento` (DATE), `sexo`, `emailColegio`, `carnetDeConducir`, `tieneCoche`, `numeroSS`, `situacionLaboral`, `idiomasConocidos`, `tutorLegal`, `dniTutorLegal` | Datos personales del formulario. `numeroSS` y `dniTutorLegal` son datos sensibles en claro (); el backend no los devuelve en listados |
| `idempresa`, `iddomicilio`, `idrepresentante`, `idtutorempresa`, `mesFCT` | Heredados de FCT, sin uso en el portal |

### `dual_solicitudes_alumno`
Participación de un alumno en una convocatoria.

| Columna | Notas |
| --- | --- |
| `id_solicitud_alumno` PK | |
| `id_alumno` FK → `gf_alumnosfct`, `id_convocatoria` FK | **UQ `(id_alumno, id_convocatoria)`**: una solicitud por alumno y convocatoria |
| `id_especialidad` INT **NN** FK → `dual_especialidades` (migración 017) | Ciclo solicitado **en esta solicitud**. No puede cambiar mientras haya reservas activas (`trg_dsa_bu_reglas`) |
| `id_estado_validacion` FK, por defecto 1 | PENDIENTE / VALIDADO / RECHAZADO / BAJA |
| `fecha_solicitud` DATETIME | |
| `motivo` TEXT | **Solo** con estado RECHAZADO (triggers). El motivo de una baja vive en `dual_eventos` |

Índices: `ix_dsa_convocatoria_estado (id_convocatoria, id_estado_validacion)`, `ix_dsa_especialidad`.

## 3. Empresas

### 🔒 `ge_empresas`
| Columna | Notas |
| --- | --- |
| `idempresa` PK | |
| `cif` VARCHAR(12) NN **UQ** | Guardado normalizado; identificador de login de la empresa. Búsquedas por `cif = ?` (usa el índice) |
| `empresa` | Razón social |
| `web`, `observaciones`, `emailEmpresa`, `telefonoEmpresa`, `menosdecincotrabajadores` | |
| `convenio`, `fechaconvenio` | Heredados; el alta los deja en `''`/NULL. El convenio actual es un documento |

Se actualiza **en el sitio** (sin historial) al editar datos de empresa.

### 🔒 `ge_domicilios`
Direcciones de una empresa (`idempresa` NN FK). Una solicitud apunta a un domicilio legal y uno de trabajo, que **pueden ser la misma fila** (casilla «mismo lugar de trabajo»). Columnas: `domicilio`, `cp`, `provincia`, `localidad`, `municipio`, `telefono`, `email`, `especialidad` (texto heredado, se inserta vacío).

### 🔒 `ge_contactos`
Personas de una empresa: representante legal, coordinador principal y tutores. `iddomicilio` NN FK (vía la que se deduce la empresa), `dni`, `nombre`, `email`, `telefono`, `cargo`, `observaciones`, `especialidad`. **No tiene `idempresa`.** El DNI del representante/coordinador se guarda tal cual en el alta pública y normalizado en las ediciones posteriores.

### `dual_solicitudes_empresa`
Participación de una empresa en una convocatoria.

| Columna | Notas |
| --- | --- |
| `id_solicitud_empresa` PK | |
| `id_empresa` FK, `id_convocatoria` FK | **UQ `(id_empresa, id_convocatoria)`** |
| `id_estado_validacion` | Como en alumno |
| `id_representante_legal`, `id_coordinador_empresa` FK → `ge_contactos` | Triggers `trg_dse_*`: ambos contactos deben pertenecer a la empresa de la solicitud |
| `id_domicilio_legal`, `id_domicilio_trabajo` FK → `ge_domicilios` | Ídem |
| `descripcion_puesto` TEXT NN | En la reaplicación puede quedar `''` |
| `fecha_solicitud`, `motivo` | `motivo` solo si RECHAZADO |
| `transportes_conocidos` TINYINT(1) NN, por defecto 1 (014) | 0 en solicitudes antiguas cuyos transportes se perdieron: la interfaz muestra «No registrado». Vuelve a 1 al guardar transportes |

### `dual_solicitud_empresa_especialidades` (oferta)
Ciclo ofertado y número de plazas de una solicitud de empresa. En el código se llama **oferta** (`idOferta`, `id_solicitud_empresa_especialidad`).

| Columna | Notas |
| --- | --- |
| `id_solicitud_empresa_especialidad` PK | |
| `id_solicitud_empresa` FK, `id_especialidad` FK | **UQ `(id_solicitud_empresa, id_especialidad)`** |
| `cantidad_alumnos` SMALLINT UNSIGNED NN | `CHECK >= 0`. El alta exige ≥ 1; la edición permite 0. Trigger `trg_dsee_bu_cupo` (017): no puede bajar por debajo de las reservas activas |

### `dual_solicitud_empresa_transportes` (014)
PK `(id_solicitud_empresa, id_transporte)`. Se reescribe entera (`DELETE` + `INSERT IGNORE`) al guardar.

### `dual_empresa_transportes` (obsoleta)
Transportes por empresa anteriores a la 014. No la lee nada; se conserva para el rollback.

### `dual_empresa_tutores`
Vincula una empresa con un contacto que actúa como tutor. **Es por empresa, no por convocatoria.**

| Columna | Notas |
| --- | --- |
| `id_empresa_tutor` PK | Lo referencia `dual_reservas.id_empresa_tutor` |
| `id_empresa` FK, `id_contacto` FK | **UQ `(id_empresa, id_contacto)`** |
| `activo` | Desactivar no lo quita de las reservas que ya lo tienen |
| `creado_en`, `actualizado_en` (`ON UPDATE CURRENT_TIMESTAMP`) | |

El coordinador principal se inserta como tutor al dar de alta la empresa (y con `INSERT IGNORE` en cada reaplicación).

### `dual_empresa_cambios`
Solicitudes de cambio de datos enviadas por la empresa, revisadas por el centro.

| Columna | Notas |
| --- | --- |
| `id_cambio` PK; `id_solicitud_empresa`, `id_empresa`, `id_usuario_solicitante`, `id_usuario_resolutor` FK | |
| `payload` JSON NN | `{ proposed: {...campos cambiados}, snapshot: {...todos los campos al enviar} }`. El *snapshot* permite detectar conflictos al aprobar |
| `estado` | `CHECK IN ('PENDIENTE','APROBADO','RECHAZADO')` |
| `fecha_solicitud`, `fecha_resolucion`, `motivo` | `motivo` = motivo de rechazo |
| `id_solicitud_pendiente` (columna generada) | `= id_solicitud_empresa` si PENDIENTE, si no NULL; **UQ** → como mucho **una solicitud de cambio pendiente por solicitud de empresa** |

## 4. Reservas

### `dual_reservas`
Asignación de una solicitud de alumno a una oferta.

| Columna | Notas |
| --- | --- |
| `id_reserva` PK | |
| `id_solicitud_alumno` FK, `id_solicitud_empresa_especialidad` FK | **UQ `(id_solicitud_alumno, id_solicitud_empresa_especialidad)`**: una fila por par alumno–oferta **para siempre**. Volver a reservar el mismo par **reactiva** la fila cancelada ([decisiones técnicas](../decisiones-tecnicas.md#reutilización-de-filas-de-reserva)). El par no puede cambiar (`trg_dr_bu_reglas`) |
| `id_estado_reserva` FK, por defecto 1 | |
| `id_tipo_contrato` FK NULL | Se fija en PENDIENTE; obligatorio en CONFIRMADA; **prohibido en CANCELADA** (los procedimientos lo ponen a NULL al cancelar, por lo que se pierde) |
| `id_empresa_tutor` FK NULL | Se conserva al cancelar; se borra al reactivar |
| `motivo` TEXT | **Solo** en CANCELADA (obligatorio) |
| `id_solicitud_alumno_confirmada` (generada) | `= id_solicitud_alumno` si `id_estado_reserva = 2`; **UQ** → **una sola reserva confirmada por solicitud de alumno**, garantizado por el motor |

Índices: `ix_dual_reservas_oferta_estado`, `ix_dual_reservas_estado`, `ix_dual_reservas_tipo_contrato`, `ix_dr_empresa_tutor`.

## 5. Documentos

### `dual_documentos`
Documento **actual** (o histórico, si `es_actual = 0`) de un padre y tipo.

| Columna | Notas |
| --- | --- |
| `id_documento` PK | |
| `id_solicitud_alumno`, `id_solicitud_empresa`, `id_reserva` FK NULL | `CHECK chk_dd_un_padre`: **exactamente uno** no nulo. Los triggers comprueban que el tipo corresponde al padre |
| `id_tipo_documento` FK NN | |
| `archivo` LONGBLOB NULL | PDF. Los listados solo calculan `archivo IS NULL` |
| `id_estado_validacion` NN, por defecto 1 | Estado de **revisión** (independiente de las firmas) |
| `motivo` | Solo si RECHAZADO |
| `estado_workflow` VARCHAR(30) | Informativo heredado (`SUBIDO`, `SUBIDO_FIRMADO`); no gobierna reglas |
| `es_actual` TINYINT NN, por defecto 1 | 0 = versión retirada (reserva reactivada, cambio de familia de contrato) que se conserva como historial |
| `id_usuario_origen` FK, `origen_documento` (`CHECK IN ('SUBIDA','GENERADO','LEGACY')`), `id_plantilla` FK, `registrado_en` | Procedencia. `LEGACY` = anterior al registro de procedencia |
| `firmas_exentas_legacy` TINYINT NN, por defecto 0 (013) | 1 solo en documentos que la 013 encontró ya VALIDADO sin filas de firma. Cualquier fichero nuevo lo vuelve a 0 |
| `padre_actual` VARCHAR(16) (generada, 017) | `'A'|'E'|'R' + id` si `es_actual = 1`, si no NULL; **UQ `uq_dd_actual (padre_actual, id_tipo_documento)`** → como mucho un documento actual por padre y tipo |

### `dual_documento_versiones`
Copia de un fichero anterior cada vez que se sustituye (`sp_guardar_documento`): `archivo`, estado, motivo, `estado_workflow`, procedencia, `archivado_en`. **Ningún código la lee** todavía. No guarda las firmas del fichero sustituido, ni tiene FK sobre estado/usuario/plantilla, y su `id_estado_validacion` es `INT` ().

### `dual_documento_firmas`
Una fila por documento y rol firmante.

| Columna | Notas |
| --- | --- |
| `id_documento` FK, `rol` (`CHECK IN ('EMPRESA','GESTOR','ALUMNO')`) | **UQ `(id_documento, rol)`** |
| `estado` (`SIN_FIRMAR` / `FIRMADO`), `firmado_en` | |
| `firmado_por` FK → `dual_usuarios` (013) | Quién la registró |
| `metodo` (013) | `CONFIRMACION_APP` (pulsó «Firmar») o `SUBIDA_FIRMADA` (subió el fichero declarando que lleva su firma). **Ninguno es verificación criptográfica** |

Cada fichero nuevo **reinicia** las firmas de ese documento (se pierde quién firmó la versión anterior).

### `dual_documento_plantillas`
Plantillas DOCX versionadas por tipo de documento generable (CONVENIO, ANEXO_II, ANEXO_III).

| Columna | Notas |
| --- | --- |
| `id_tipo_documento` FK, `version` | **UQ `(id_tipo_documento, version)`** |
| `archivo` LONGBLOB NN, `nombre_archivo`, `mime_type`, `id_usuario_subida` FK, `creado_en` | |
| `es_activa` + `activa_tipo` (generada) | **UQ `uq_plantilla_activa (activa_tipo)`** → una plantilla activa por tipo |

### `calendario` (obsoleta)
Calendario por alumno-empresa con un BLOB, anterior al tipo de documento `CALENDARIO`. Sin uso.

## 6. Cuentas y auditoría

### `dual_usuarios`
| Columna | Notas |
| --- | --- |
| `id_usuario` PK | |
| `nombre_mostrar` NN | Para EMPRESA = nombre del coordinador (se sincroniza al cambiarlo) |
| `email` **UQ** NULL | Obligatorio para ADMINISTRADOR/COORDINADOR (trigger); NULL para EMPRESA y ALUMNO |
| `password_hash` | bcrypt (coste 10) |
| `id_rol` FK | |
| `id_contacto` FK **UQ** NULL / `id_alumno` FK **UQ** NULL | Triggers `trg_dual_usuarios_bi/bu_role_links`: EMPRESA ↔ contacto obligatorio y sin alumno; ALUMNO ↔ alumno obligatorio y sin contacto |
| `activo` | 0 → no puede iniciar sesión y las sesiones abiertas se rechazan en la siguiente petición |
| `must_change_password` | 1 → todas las rutas salvo `/auth/me` y `/auth/changePassword` devuelven 403 |

### `dual_eventos` (013)
Registro de auditoría **solo de inserción**: los triggers `trg_de_bu_inmutable` y `trg_de_bd_inmutable` rechazan `UPDATE` y `DELETE`.

| Columna | Notas |
| --- | --- |
| `id_evento` BIGINT PK | |
| `entidad` | Desde la 019: `SOLICITUD_ALUMNO`, `SOLICITUD_EMPRESA`, `RESERVA`, `DOCUMENTO`, `OFERTA`, `TUTOR`, `USUARIO`. `OFERTA` y `TUTOR` los aporta la migración de reservas 018; la 019 los conserva y añade `USUARIO` |
| `id_entidad`, `accion` (VARCHAR 40) | Acciones usadas: `VALIDAR`, `RECHAZAR`, `REABRIR`, `BAJA`, `REACTIVAR`, `RESERVAR`, `CANCELAR`, `REASIGNAR`, `CONFIRMAR`, `TIPO_CONTRATO`, `SUBIR`, `GENERAR`, `FIRMAR`, `EXENCION_FIRMA_LEGACY`. En `USUARIO`: `ALTA`, `BAJA`, `REACTIVAR`, `CAMBIAR_ROL`, `CAMBIAR_DATOS`, `RESETEAR_PASSWORD` |
| `estado_anterior`, `estado_nuevo` VARCHAR(30) | En `TIPO_CONTRATO` se guardan **ids** (algún nombre supera 30 caracteres) y los nombres en `detalle` |
| `id_usuario` FK NULL, `rol_usuario` | NULL en acciones públicas (p. ej. generación del convenio en el alta) |
| `motivo`, `detalle` JSON | Ids y metadatos; nunca nombres, DNI, emails ni ficheros |
| `creado_en` DATETIME(3) | |

Lo que **no** se audita: cambios de datos de empresa, cupos y ofertas, tutores y su asignación, convocatorias, plantillas, la contraseña de alumnos y empresas, y las cancelaciones por reducción de cupo. Las cuentas de personal sí: alta, edición, baja, reactivación y reseteo de contraseña, con entidad `USUARIO` (ids, rol y `activo`; nunca el email ni la contraseña).

### `schema_migrations`
Historial del ejecutor de migraciones: `version` CHAR(3) PK, `name`, `checksum` (SHA-256 del fichero con saltos de línea normalizados), `applied_at`, `applied_by`, `mode` (`RUN` o `MARK`).

## 7. Datos derivados (no almacenados)

| Concepto | Cálculo | Dónde |
| --- | --- | --- |
| Plazas ocupadas | Reservas PENDIENTE + CONFIRMADA de la oferta | `fn_reservas_activas`, consultas de cupos |
| Plazas disponibles | `GREATEST(cantidad_alumnos − ocupadas, 0)` | `fn_cupos_disponibles` |
| Familia de anexo de una reserva | `anexoClaveForContrato(tc.nombre)` / `anexoClaveSql` / `sp_confirmar_reserva` | [`documentCatalogue.js`](../../../backend/src/services/documentCatalogue.js) |
| Estado operativo de un documento | `deriveDocumentState`: sin fichero → `PENDIENTE_SUBIDA`/`PENDIENTE_GENERACION`; VALIDADO; RECHAZADO; firmas pendientes → `PENDIENTE_FIRMA`; revisable → `PENDIENTE_VALIDACION`; si no → `COMPLETO` | Ídem |
| Motivo y fecha de baja | Último evento `BAJA` de la solicitud | Subconsultas en `getAll` de solicitudes |
| Estado previo a la baja | `estado_anterior` del último evento `BAJA` | `bajaService.reactivar` |
