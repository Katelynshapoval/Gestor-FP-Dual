# Integridad, procedimientos, triggers y transacciones

> Parte de la [base de datos](vision-general.md). Definiciones vigentes: `000_baseline.sql`, sustituidas en parte por [`012`](../../../db/migrations/012_reglas_por_nombre_y_reservas.sql) y [`017`](../../../db/migrations/017_integridad_especialidad_documentos_cupos.sql). Cuando un objeto se redefine, vale **la última migración que lo crea**.

## 1. Restricciones declarativas

| Restricción | Tabla | Regla |
| --- | --- | --- |
| `chk_dual_convocatorias_fechas` | convocatorias | `fecha_fin >= fecha_inicio` |
| `chk_*_activo` / `chk_*_activa` / `chk_dual_usuarios_pwd_change` | varias | 0 o 1 |
| `chk_dual_especialidades_turno` | especialidades | 0 o 1 |
| `chk_dsee_cantidad_alumnos` | ofertas | `>= 0` |
| `chk_dsp_orden` | preferencias | 1–3 |
| `chk_dd_un_padre` | documentos | exactamente un padre |
| `chk_documentos_origen` | documentos | `SUBIDA`, `GENERADO`, `LEGACY` |
| `chk_dd_firmas_exentas` | documentos | 0 o 1 |
| `chk_dual_documento_firmas_estado` / `_rol` / `chk_ddf_metodo` | firmas | valores cerrados |
| `chk_dec_estado` | cambios | `PENDIENTE`, `APROBADO`, `RECHAZADO` |
| `chk_de_entidad` | eventos | 4 entidades |
| `chk_dse_transportes_conocidos` | solicitudes empresa | 0 o 1 |

Unicidades de negocio con **columna generada** (patrón «único solo cuando…»):

| Índice único | Columna generada | Garantiza |
| --- | --- | --- |
| `uq_dual_reservas_confirmada_alumno` | `id_solicitud_alumno_confirmada` = alumno si estado = 2 | Una reserva confirmada por solicitud de alumno |
| `uq_dec_solicitud_pendiente` | `id_solicitud_pendiente` = solicitud si `PENDIENTE` | Un cambio de datos pendiente por solicitud |
| `uq_plantilla_activa` | `activa_tipo` = tipo si `es_activa = 1` | Una plantilla activa por tipo |
| `uq_dd_actual` | `padre_actual` = `A|E|R` + id si `es_actual = 1` | Un documento actual por padre y tipo |

Una violación de `CHECK` llega al cliente como **400 `RESTRICCION`** con el mensaje de MySQL; una de unicidad como **409 `DUPLICADO`** (o `DOCUMENTO_CONCURRENTE` si es `uq_dd_actual`). Ver [mapeo de errores](../api-e-integraciones/README.md#mapeo-de-errores-sql).

## 2. Funciones

| Función | Devuelve | Notas |
| --- | --- | --- |
| `fn_id_estado_reserva(nombre)`, `fn_id_estado_validacion(nombre)`, `fn_id_tipo_documento(nombre)` | id del catálogo | `SIGNAL 45000` («… no configurado») si el nombre no existe → 400 `REGLA_NEGOCIO`. Declaradas `DETERMINISTIC` aunque leen datos |
| `fn_reservas_activas(id_oferta)` | nº de reservas PENDIENTE + CONFIRMADA | Se usa en listados y en `trg_dsee_bu_cupo` |
| `fn_cupos_disponibles(id_oferta)` | `GREATEST(cantidad − activas, 0)` | Listados de ofertas elegibles |

## 3. Procedimientos almacenados

Leyenda de transacción: **propia** = el procedimiento hace `START TRANSACTION … COMMIT` y un `EXIT HANDLER` que hace `ROLLBACK; RESIGNAL`; **del llamante** = se ejecuta en la transacción (o autocommit) de quien lo llama.

| Procedimiento | Transacción | Llamado desde | Qué hace |
| --- | --- | --- | --- |
| `sp_validar_solicitud_alumno(id)` | del llamante | `solicitudTransiciones` | Exige CV y ANEXO_DGA **actuales y VALIDADO**; pone VALIDADO y `motivo = NULL` |
| `sp_rechazar_solicitud_alumno(id, motivo)` | del llamante | ídem | Motivo obligatorio; RECHAZADO |
| `sp_validar_solicitud_empresa(id)` | del llamante | `solicitudTransiciones`, `documentosService.validar` (cascada del convenio) | Exige CONVENIO actual VALIDADO y ≥ 1 oferta |
| `sp_rechazar_solicitud_empresa(id, motivo)` | del llamante | ídem | |
| `sp_validar_documento(id)` / `sp_rechazar_documento(id, motivo)` | del llamante | `documentosService` | Envoltorios finos: las reglas (firmas, versión actual) están en Node |
| `sp_guardar_documento(padres…, tipo, archivo)` | del llamante | `documentosStore.saveByClave`, alta de alumno | Busca el documento actual con **lectura bloqueante** (`FOR UPDATE`, desde 017). Si existe: copia fila a `dual_documento_versiones` y lo sustituye (PENDIENTE, `motivo` NULL, `estado_workflow` `SUBIDO`). Si no: lo inserta con `origen_documento = 'LEGACY'` (el llamante lo corrige). Devuelve `SELECT id_documento` |
| `sp_reservar_alumno(id_sol_alumno, id_oferta)` | **propia** | `reservasService.executeReservar` | Ver § 3.1 |
| `sp_cancelar_reserva(id, motivo)` | del llamante (una sola sentencia) | `reservasService.cancelar` (empresa) | `UPDATE … WHERE estado = PENDIENTE`; si no afecta filas, error. Pone `id_tipo_contrato = NULL`; conserva tutor y documentos |
| `sp_cancelar_reserva_admin(id, motivo)` | **propia** | `reservasService.cancelarAdmin`, `bajaService` | Bloquea la fila; PENDIENTE o CONFIRMADA → CANCELADA; ya cancelada → error |
| `sp_confirmar_reserva(id, id_tipo)` | **propia** | `reservasService.confirmar` | Ver § 3.2 |
| `sp_reasignar_reserva(id_origen, id_oferta_destino, motivo)` | **propia** | `reservasService.reasignar` | Ver § 3.3 |
| `sp_activar_convocatoria(id)` | propia | **nadie** (obsoleto; la activación es por fechas) | |
| `sp_asignar_transporte_empresa` | del llamante | **nadie** (escribe la tabla obsoleta) | |

### 3.1 `sp_reservar_alumno`
Orden de bloqueo: oferta (`FOR UPDATE`) → reservas de la oferta → solicitud de alumno → reservas del alumno → par existente.

1. Error si la oferta o la solicitud no existen.
2. Cuenta plazas ocupadas (PENDIENTE+CONFIRMADA) y si el alumno ya tiene una confirmada.
3. **Par inexistente**: si ya hay confirmada o no hay plazas → error; si no, `INSERT` PENDIENTE (dispara `trg_dr_bi_reglas`).
4. **Par existente PENDIENTE**: devuelve su id **sin cambiar nada** (idempotente en BD).
5. **Par existente CONFIRMADA**: error «ya tiene una reserva confirmada con esta oferta».
6. **Par existente CANCELADA** (reactivación, WF-4): mismas comprobaciones de confirmada y plazas; `UPDATE` a PENDIENTE con `id_tipo_contrato`, `id_empresa_tutor` y `motivo` a NULL; los documentos de la reserva pasan a `es_actual = 0` (historial).

No comprueba el estado VALIDADO de las solicitudes en la reactivación (ni el trigger de UPDATE): lo hace Node antes, fuera del bloqueo (DB-05).

### 3.2 `sp_confirmar_reserva`
1. Bloquea la reserva; debe existir y estar PENDIENTE.
2. Exige `id_tipo_contrato` guardado; si se pasa otro distinto → error.
3. Familia: `IF(LOWER(nombre) LIKE '%beca%', 'ANEXO_III', 'ANEXO_II')`.
4. Exige el anexo de esa familia **actual, con fichero y VALIDADO** (las firmas las comprueba Node antes: como un fichero nuevo vuelve a PENDIENTE, un anexo validado siempre tiene sus firmas).
5. Bloquea la solicitud de alumno; pasa la reserva a CONFIRMADA (`motivo` NULL).
6. Cancela **las demás reservas PENDIENTE del mismo alumno** con `motivo = 'Alumno asignado a otra empresa.'` y `id_tipo_contrato = NULL`.

### 3.3 `sp_reasignar_reserva`
Orden de bloqueo: reserva origen → oferta destino → solicitud de alumno → reservas del alumno → reservas de la oferta destino.

1. Motivo obligatorio; origen existente y no CANCELADA; destino distinto del origen y existente.
2. Si el alumno ya tiene una reserva **activa** en el destino → error. Si no hay plazas en el destino → error.
3. Origen → CANCELADA con el motivo (tipo de contrato a NULL; tutor y documentos se conservan).
4. Destino: `INSERT` PENDIENTE o, si existía una fila cancelada del par, reactivación limpia (tutor y tipo a NULL, documentos a historial).
5. Devuelve `id_reserva` (destino) e `id_reserva_origen`.

Funciona también desde una reserva **CONFIRMADA**: el alumno pierde la plaza confirmada y queda PENDIENTE en el destino. No toca las otras reservas pendientes del alumno.

## 4. Triggers

| Trigger | Momento | Regla |
| --- | --- | --- |
| `trg_convocatorias_bi_una_activa` / `_bu_` | BEFORE INSERT/UPDATE | Como mucho una convocatoria `activa = 1`. El mensaje del BU nombra `sp_activar_convocatoria` (obsoleto) |
| `trg_dsa_bi_reglas` (017) | BEFORE INSERT solicitud alumno | `id_especialidad` obligatoria; convocatoria activa; RECHAZADO exige motivo |
| `trg_dsa_bu_reglas` (017) | BEFORE UPDATE solicitud alumno | Motivo **solo** si RECHAZADO (y obligatorio entonces); `id_especialidad` no cambia si hay reservas activas |
| `trg_dse_bi_reglas` | BEFORE INSERT solicitud empresa | Representante, coordinador y domicilios de la misma empresa; convocatoria activa; motivo si RECHAZADO |
| `trg_dse_bu_reglas` | BEFORE UPDATE | Misma pertenencia; motivo solo si RECHAZADO |
| `trg_dsee_bu_cupo` (017) | BEFORE UPDATE oferta | Al **reducir** `cantidad_alumnos`, no por debajo de `fn_reservas_activas` |
| `trg_dr_bi_reglas` (017) | BEFORE INSERT reserva | Ambas solicitudes VALIDADO; misma convocatoria; **ciclo de la solicitud = ciclo de la oferta**; si activa: plazas libres y sin confirmada previa; CONFIRMADA exige tipo; no-CONFIRMADA no admite tipo; CANCELADA exige motivo |
| `trg_dr_bu_reglas` (012) | BEFORE UPDATE reserva | Par inmutable; CONFIRMADA solo → CONFIRMADA/CANCELADA; → CONFIRMADA solo desde PENDIENTE (o 2→2 para cambiar el tutor); CONFIRMADA exige tipo; **CANCELADA prohíbe tipo** y exige motivo; motivo solo en CANCELADA; CANCELADA → activa: plazas y sin otra confirmada |
| `trg_dd_bi_reglas` / `_bu_` (012) | BEFORE INSERT/UPDATE documento | Un padre; tipo ↔ padre (`CV, ANEXO_DGA, ANEXO_2, FORMULARIO` → alumno; `CONVENIO, ANEXO_XIV, ANEXO_G, EXCEL` → empresa; `ANEXO_II, ANEXO_III, CALENDARIO, ANEXO_H` → reserva; `OTRO` en cualquiera); RECHAZADO exige motivo; (BU) motivo solo si RECHAZADO |
| `trg_de_bu_inmutable` / `trg_de_bd_inmutable` (013) | BEFORE UPDATE/DELETE eventos | Siempre error |
| `trg_dual_usuarios_bi_role_links` / `_bu_` | BEFORE INSERT/UPDATE usuario | EMPRESA ↔ contacto; ALUMNO ↔ alumno; personal ↔ email |

Todos señalan con `SQLSTATE '45000'`, que el backend traduce a **400 `REGLA_NEGOCIO`** con el texto del trigger. Esa es la razón de algunos mensajes técnicos que puede ver el usuario (p. ej. «El alumno debe tener id_especialidad_dual…» ya no existe desde 017, pero «Una reserva cancelada no puede tener tipo de contrato.» sí).

### 4.1 Consecuencias de diseño de los triggers

- **Motivos sincronizados con el estado**: un `UPDATE` que cambie el estado debe poner o quitar el motivo en la misma sentencia. Por eso `REABRIR`, `BAJA` y `VALIDAR` escriben `motivo = NULL` y `REACTIVAR` a RECHAZADO repone el motivo del último evento `RECHAZAR`.
- **El motivo de la baja no cabe en la fila** (solo se admite en RECHAZADO): se guarda en `dual_eventos` (migración 016).
- **El tipo de contrato se pierde al cancelar** porque `trg_dr_bu_reglas` lo prohíbe en CANCELADA; todos los caminos de cancelación lo ponen a NULL (DB-04, propuesta D5 del plan de BD).

## 5. Transacciones

### 5.1 Quién es dueño de cada transacción

| Operación | Dueño | Auditoría |
| --- | --- | --- |
| Validar/rechazar/reabrir solicitud | Backend (`aplicarTransicion`) | En la transacción |
| Validar/rechazar/firmar documento | Backend | En la transacción |
| Guardar documento | Backend (`saveByClave`) o la del llamante | En la transacción |
| Cambiar tipo de contrato | Backend | En la transacción |
| Reducir cupo (cancelaciones incluidas) | Backend | **Ninguna** |
| Datos de empresa, cambios, tutores, ofertas | Backend | Ninguna (`dual_empresa_cambios` registra solo las solicitudes de cambio) |
| Baja (cambio de estado + cuentas) | Backend | En la transacción |
| Baja (cancelación de cada reserva) | **Procedimiento** (una transacción por reserva) | Después del commit |
| Reservar, reasignar, confirmar, cancelar (admin) | **Procedimiento** | **Después del commit** (`recordEventAfterCommit`) |
| Cancelar (empresa) | Sentencia única en autocommit | Después |
| Alta pública de alumno/empresa | Backend | Ninguna (el convenio generado sí registra `GENERAR`) |

Un `START TRANSACTION` dentro de una transacción abierta la **confirma implícitamente** en MySQL; por eso los procedimientos con transacción propia se llaman siempre sobre el *pool* y nunca dentro de una transacción del backend (hallazgo DB-06; la etapa 2 del plan propone invertirlo).

### 5.2 Requisitos de atomicidad y lo que no es atómico

Atómico (todo o nada):
- Alta pública de alumno (persona, solicitud, dos documentos, preferencias, cuenta).
- Alta pública de empresa (empresa, domicilios, contactos, solicitud, ofertas, transportes, cuenta, tutor).
- Validar un convenio **y** la solicitud de empresa PENDIENTE.
- Guardar un documento (versión, procedencia, firmas, evento).
- Reducir un cupo y cancelar las reservas elegidas.
- Confirmar una reserva y cancelar las demás pendientes del alumno (dentro del procedimiento).

**No** atómico:
- **Evento de auditoría de reservas**: si falla tras el commit, la transición queda sin evento (solo un mensaje en consola).
- **Baja**: el estado BAJA y la desactivación de cuentas se confirman antes de cancelar reservas; si una cancelación falla, la baja queda y la respuesta lista las reservas `pendientes`.
- **Alta de empresa + convenio**: la solicitud existe aunque la generación falle.
- **Correos**: siempre después del commit, sin reintento.

### 5.3 Bloqueos y concurrencia

| Situación | Mecanismo | Resultado ante la carrera |
| --- | --- | --- |
| Dos reservas por la última plaza | `FOR UPDATE` sobre la oferta y sus reservas en el procedimiento + recuento del trigger | Una gana; la otra recibe 400 «No quedan plazas…» |
| Dos confirmaciones del mismo alumno | `uq_dual_reservas_confirmada_alumno` | `ER_DUP_ENTRY` → 409 «El alumno ya tiene otra reserva confirmada.» |
| Dos subidas simultáneas del mismo documento | `SELECT padre FOR UPDATE` al inicio de `saveByClave` + `FOR UPDATE` en el procedimiento + `uq_dd_actual` | Se serializan: un documento actual y el otro archivado; si aun así colisionan → 409 `DOCUMENTO_CONCURRENTE` |
| Dos altas públicas del mismo CIF o DNI | `SELECT … FOR UPDATE` (bloqueo de hueco) + índice único | 409 (`EMPRESA_YA_REGISTRADA` / `DUPLICADO`) o interbloqueo → 409 `CONCURRENCIA` |
| Interbloqueo o espera de bloqueo agotada (50 s) | `mapSqlError` (017) | 409 `CONCURRENCIA`; **no hay reintento automático** |
| Órdenes de bloqueo distintos entre procedimientos | — | Posibles interbloqueos bajo concurrencia (DB-07, sospechado, no reproducido) |
| Comprobaciones previas en Node fuera del bloqueo (`validateReservaTargets`, guardas de subida, `missingStudentValidation`) | Repetidas en procedimiento/trigger cuando es crítico | Ventana estrecha en la reactivación de reservas (DB-05) |
| Subida de dos plantillas a la vez | `MAX(version) … FOR UPDATE` + `uq_plantilla_tipo_version` | La segunda puede fallar con `ER_DUP_ENTRY`; `plantillasService.upload` relanza el error → **500** 🔶 |

## 6. Consultas y patrones de acceso importantes

- **Documento actual por padre y tipo** (`documentosWorkflow.latestDocs`): `WHERE (padres…) AND es_actual = 1 ORDER BY id_documento DESC`, y en memoria se queda el primero de cada `padre:clave`. Con `uq_dd_actual` ya no puede haber dos.
- **Plazas** (`getCuposEmpresa`, `getEspecialidades`): `COUNT(CASE …)` por estado con subconsultas al catálogo por nombre, o `fn_reservas_activas`/`fn_cupos_disponibles` por fila.
- **Alumnos disponibles para una empresa** (`getAlumnosDisponibles`): solicitudes VALIDADO de la convocatoria activa, con `sa.id_especialidad` dentro de las especialidades de las ofertas VALIDADO de la empresa, **sin** reserva confirmada (`LEFT JOIN … IS NULL`), con `mi_reserva_id` si la empresa ya tiene una activa.
- **Ofertas/alumnos elegibles** para el personal: misma convocatoria y ciclo, ambos VALIDADO, `fn_cupos_disponibles > 0`, sin reserva activa del par y sin confirmada del alumno (`ACTIVE_PAIR_SQL`). En reasignación no se excluye al alumno confirmado.
- **Motivo/fecha de baja**: subconsultas correlacionadas al último evento `BAJA`.
- **Seguimiento documental**: tres consultas (todas las solicitudes de alumno, de empresa y reservas no canceladas de **todos los años**) + documentos actuales + firmas + plantillas activas; la proyección, filtrado y paginación se hacen en Node ([panel y seguimiento](../logica-de-negocio/panel-y-seguimiento.md)).
