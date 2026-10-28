# Integridad, procedimientos, triggers y transacciones

> Parte de la [base de datos](vision-general.md). Definiciones vigentes: `000_baseline.sql`, sustituidas en parte por [`012`](../../../db/migrations/012_reglas_por_nombre_y_reservas.sql), [`017`](../../../db/migrations/017_integridad_especialidad_documentos_cupos.sql) y [`018`](../../../db/migrations/018_reservas_por_intento_y_transacciones.sql). Cuando un objeto se redefine, vale **la última migración que lo crea**.

## 1. Restricciones declarativas

| Restricción | Tabla | Regla |
| --- | --- | --- |
| `chk_dual_convocatorias_fechas` | convocatorias | `fecha_fin >= fecha_inicio` |
| `chk_*_activo` / `chk_*_activa` / `chk_dual_usuarios_pwd_change` | varias | 0 o 1 |
| `chk_dual_especialidades_turno` | especialidades | 0 o 1 |
| `chk_dsee_cantidad_alumnos` | ofertas | `>= 0` |
| `chk_dd_un_padre` | documentos | exactamente un padre |
| `chk_documentos_origen` | documentos | `SUBIDA`, `GENERADO`, `LEGACY` |
| `chk_dd_firmas_exentas` | documentos | 0 o 1 |
| `chk_dual_documento_firmas_estado` / `_rol` / `chk_ddf_metodo` | firmas | valores cerrados |
| `chk_dec_estado` | cambios de empresa | `PENDIENTE`, `APROBADO`, `RECHAZADO` |
| `chk_dac_estado` / `chk_dac_motivo` / `chk_dac_resolucion` (020) | cambios de alumno | Mismos estados; RECHAZADO exige motivo; `fecha_resolucion` existe si y solo si no está PENDIENTE |
| `chk_de_entidad` | eventos | 7 entidades (desde la 019) |
| `chk_dse_transportes_conocidos` | solicitudes empresa | 0 o 1 |

Unicidades de negocio con **columna generada** (patrón «único solo cuando…»):

| Índice único | Columna generada | Garantiza |
| --- | --- | --- |
| `uq_dual_reservas_confirmada_alumno` | `id_solicitud_alumno_confirmada` = alumno si estado = 2 | Una reserva confirmada por solicitud de alumno |
| `uq_dr_par_activo` (018) | `id_alumno_activo` = solicitud de alumno si PENDIENTE o CONFIRMADA | Un solo intento **activo** por par alumno–oferta (los cancelados no cuentan) |
| `uq_dec_solicitud_pendiente` | `id_solicitud_pendiente` = solicitud si `PENDIENTE` | Un cambio de datos de empresa pendiente por solicitud |
| `uq_dac_solicitud_pendiente` (020) | `id_solicitud_pendiente` = solicitud si `PENDIENTE` | Una petición de corrección de alumno pendiente por solicitud |
| `uq_plantilla_activa` | `activa_tipo` = tipo si `es_activa = 1` | Una plantilla activa por tipo |
| `uq_dd_actual` | `padre_actual` = `A|E|R` + id si `es_actual = 1` | Un documento actual por padre y tipo |

Además, `dual_reservas.id_reserva_origen` es único (018): una reserva solo se reasigna una vez.

Una violación de `CHECK` llega al cliente como **400 `RESTRICCION`** con el mensaje de MySQL; una de unicidad como **409 `DUPLICADO`** (o `DOCUMENTO_CONCURRENTE` si es `uq_dd_actual`). Ver [mapeo de errores](../api-e-integraciones/README.md#mapeo-de-errores-sql).

## 2. Funciones

| Función | Devuelve | Notas |
| --- | --- | --- |
| `fn_id_estado_reserva(nombre)`, `fn_id_estado_validacion(nombre)`, `fn_id_tipo_documento(nombre)` | id del catálogo | `SIGNAL 45000` («… no configurado») si el nombre no existe → 400 `REGLA_NEGOCIO`. Declaradas `DETERMINISTIC` aunque leen datos |
| `fn_reservas_activas(id_oferta)` | nº de reservas PENDIENTE + CONFIRMADA | Lectura simple. Se usa en listados; desde la 018 `trg_dsee_bu_cupo` cuenta con lectura bloqueante en su lugar |
| `fn_cupos_disponibles(id_oferta)` | `GREATEST(cantidad − activas, 0)` | Listados de ofertas elegibles |

## 3. Procedimientos almacenados

Leyenda de transacción: **del llamante** = se ejecuta en la transacción (o autocommit) de quien lo llama; **del llamante, obligatoria** (018) = el procedimiento no abre, confirma ni deshace nada, y si se llama con `autocommit = 1` se detiene con `SQLSTATE 45001` (error de programación → 500). El backend los llama siempre dentro de `inTransaction` ([`db/transaction.js`](../../../backend/src/db/transaction.js)) y desde un único módulo, [`reservasTx.js`](../../../backend/src/services/reservasTx.js). Para llamarlos a mano desde Workbench: `SET autocommit = 0; CALL …; COMMIT; SET autocommit = 1;`.

| Procedimiento | Transacción | Llamado desde | Qué hace |
| --- | --- | --- | --- |
| `sp_validar_solicitud_alumno(id)` | del llamante | `solicitudTransiciones` | Exige CV y ANEXO_DGA **actuales y VALIDADO**; pone VALIDADO y `motivo = NULL` |
| `sp_rechazar_solicitud_alumno(id, motivo)` | del llamante | ídem | Motivo obligatorio; RECHAZADO |
| `sp_validar_solicitud_empresa(id)` | del llamante | `solicitudTransiciones`, `documentosService.validar` (cascada del convenio) | Exige CONVENIO actual VALIDADO y ≥ 1 oferta |
| `sp_rechazar_solicitud_empresa(id, motivo)` | del llamante | ídem | |
| `sp_validar_documento(id)` / `sp_rechazar_documento(id, motivo)` | del llamante | `documentosService` | Envoltorios finos: las reglas (firmas, versión actual) están en Node |
| `sp_guardar_documento(padres…, tipo, archivo)` | del llamante | `documentosStore.saveByClave`, alta de alumno | Busca el documento actual con **lectura bloqueante** (`FOR UPDATE`, desde 017). Si existe: copia fila a `dual_documento_versiones` y lo sustituye (PENDIENTE, `motivo` NULL, `estado_workflow` `SUBIDO`). Si no: lo inserta con `origen_documento = 'LEGACY'` (el llamante lo corrige). Devuelve `SELECT id_documento` |
| `sp_reservar_alumno(id_sol_alumno, id_oferta)` | **del llamante, obligatoria** | `reservasTx.reservar` | Ver § 3.1 |
| `sp_cancelar_reserva(id, motivo)` | **del llamante, obligatoria** | `reservasTx.cancelarPendiente` (empresa, reducción de cupo) | Bloquea la oferta y luego la reserva; solo PENDIENTE → CANCELADA. **Conserva** tipo de contrato, tutor y documentos (D5) |
| `sp_cancelar_reserva_admin(id, motivo)` | **del llamante, obligatoria** | `reservasTx.cancelarAdmin` (personal, baja) | Mismo orden de bloqueo; PENDIENTE o CONFIRMADA → CANCELADA; ya cancelada → error. Conserva el tipo |
| `sp_confirmar_reserva(id, id_tipo)` | **del llamante, obligatoria** | `reservasTx.confirmar` | Ver § 3.2 |
| `sp_reasignar_reserva(id_origen, id_oferta_destino, motivo)` | **del llamante, obligatoria** | `reservasTx.reasignar` | Ver § 3.3 |
| `sp_activar_convocatoria(id)` | propia | **nadie** (obsoleto; la activación es por fechas) | |
| `sp_asignar_transporte_empresa` | del llamante | **nadie** (escribe la tabla obsoleta) | |

**Orden de bloqueo único (018)**: solicitud de alumno → solicitud de empresa → ofertas (por id ascendente) → reservas. Nada cambia el estado de una reserva sin tener antes el bloqueo de **su oferta**, y los recuentos que bloquean nombran su índice (`FORCE INDEX`). Así una cancelación y una reserva sobre la misma oferta se serializan en lugar de interbloquearse.

### 3.1 `sp_reservar_alumno`
1. Error si la solicitud de alumno o la oferta no existen. Bloquea en el orden común.
2. Comprueba primero la **elegibilidad** (ambas solicitudes VALIDADO) y después las plazas, para que un alumno dado de baja no reciba «No quedan plazas».
3. Error si el par ya tiene un intento **activo** («El alumno ya tiene una reserva activa con esta oferta.»), si el alumno ya tiene una confirmada o si no hay plazas.
4. `INSERT` de una fila PENDIENTE **nueva**. Volver a reservar tras una cancelación crea otro intento: la fila cancelada no se toca.

### 3.2 `sp_confirmar_reserva`
1. Bloquea en el orden común; la reserva debe existir y estar PENDIENTE.
2. Exige `id_tipo_contrato` guardado; si se pasa otro distinto → error.
3. Familia: `IF(LOWER(nombre) LIKE '%beca%', 'ANEXO_III', 'ANEXO_II')`.
4. Exige el anexo de esa familia **actual, con fichero y VALIDADO**. Las firmas las comprueba Node antes, en la misma transacción y con los bloqueos ya tomados (`reservasTx.bloquearParaConfirmar`).
5. Pasa la reserva a CONFIRMADA (`motivo` NULL).
6. Cancela **las demás reservas PENDIENTE del mismo alumno** con `motivo = 'Alumno asignado a otra empresa.'`; **conservan** su tipo de contrato (D5).

### 3.3 `sp_reasignar_reserva`
1. Motivo obligatorio; origen existente y no CANCELADA; destino distinto del origen y existente; solicitudes VALIDADO.
2. Si el alumno ya tiene una reserva **activa** en el destino → error. Si no hay plazas en el destino → error.
3. Origen → CANCELADA con el motivo; conserva tipo de contrato, tutor y documentos.
4. Destino: **siempre** `INSERT` de una fila PENDIENTE nueva con `id_reserva_origen` = origen (sin tipo, tutor ni documentos).
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
| `trg_dsee_bu_cupo` (018) | BEFORE UPDATE oferta | Al **reducir** `cantidad_alumnos`, no por debajo de las reservas activas, contadas con lectura bloqueante |
| `trg_dr_bi_reglas` (018) | BEFORE INSERT reserva | Lecturas bloqueantes. Ambas solicitudes VALIDADO; misma convocatoria; **ciclo de la solicitud = ciclo de la oferta**; si activa: plazas libres y sin confirmada previa; `id_reserva_origen`, si lo hay, es una reserva cancelada de la misma solicitud; CONFIRMADA exige tipo; una fila nueva no-CONFIRMADA no admite tipo; CANCELADA exige motivo |
| `trg_dr_bu_reglas` (018) | BEFORE UPDATE reserva | **CANCELADA es definitiva**: cualquier cambio real se rechaza. Par e `id_reserva_origen` inmutables; CONFIRMADA solo → CONFIRMADA/CANCELADA, y a CANCELADA solo por la vía administrativa; → CONFIRMADA solo desde PENDIENTE (o 2→2 para cambiar el tutor); CONFIRMADA exige tipo; CANCELADA exige motivo y **conserva el tipo**; motivo solo en CANCELADA |
| `trg_dd_bi_reglas` / `_bu_` (012) | BEFORE INSERT/UPDATE documento | Un padre; tipo ↔ padre (`CV, ANEXO_DGA, ANEXO_2, FORMULARIO` → alumno; `CONVENIO, ANEXO_XIV, ANEXO_G, EXCEL` → empresa; `ANEXO_II, ANEXO_III, CALENDARIO, ANEXO_H` → reserva; `OTRO` en cualquiera); RECHAZADO exige motivo; (BU) motivo solo si RECHAZADO |
| `trg_de_bu_inmutable` / `trg_de_bd_inmutable` (013) | BEFORE UPDATE/DELETE eventos | Siempre error |
| `trg_dual_usuarios_bi_role_links` / `_bu_` | BEFORE INSERT/UPDATE usuario | EMPRESA ↔ contacto; ALUMNO ↔ alumno; personal ↔ email |

Todos señalan con `SQLSTATE '45000'`, que el backend traduce a **400 `REGLA_NEGOCIO`** con el texto del trigger. Esa es la razón de algunos mensajes técnicos que puede ver el usuario (p. ej. «Una reserva cancelada es definitiva y no se puede modificar. Crea una reserva nueva.»). `SQLSTATE '45001'` (procedimiento llamado sin transacción) llega como **500**.

### 4.1 Consecuencias de diseño de los triggers

- **Motivos sincronizados con el estado**: un `UPDATE` que cambie el estado debe poner o quitar el motivo en la misma sentencia. Por eso `REABRIR`, `BAJA` y `VALIDAR` escriben `motivo = NULL` y `REACTIVAR` a RECHAZADO repone el motivo del último evento `RECHAZAR`.
- **El motivo de la baja no cabe en la fila** (solo se admite en RECHAZADO): se guarda en `dual_eventos` (migración 016).
- **Cada intento conserva su historia** (018, D5): al cancelar se mantienen el tipo de contrato, el tutor, el motivo y los documentos. Las reservas canceladas **antes** de la 018 perdieron el tipo con la regla anterior, y no se puede recuperar.

## 5. Transacciones

### 5.1 Quién es dueño de cada transacción

| Operación | Dueño | Auditoría |
| --- | --- | --- |
| Validar/rechazar/reabrir solicitud | Backend (`aplicarTransicion`) | En la transacción |
| Validar/rechazar/firmar documento | Backend | En la transacción |
| Guardar documento | Backend (`saveByClave`) o la del llamante | En la transacción |
| Reservar, reasignar, confirmar, cancelar (empresa y personal), tipo de contrato | Backend (`inTransaction`), con los procedimientos dentro | En la transacción, antes del único `COMMIT` |
| Reducir cupo (cancelaciones incluidas) | Backend (`inTransaction`) | En la transacción: `OFERTA/CUPO` y un `CANCELAR` por reserva |
| Nueva oferta (ciclo añadido) | Backend | `OFERTA/ALTA` |
| Tutores y su asignación | Backend | `TUTOR` (ALTA, EDITAR, DESACTIVAR) y `RESERVA/TUTOR` |
| Datos de empresa y sus cambios | Backend | Ninguna (`dual_empresa_cambios` registra solo las solicitudes de cambio) |
| Corrección de datos de alumno (directa o por petición) | Backend | En la transacción: `DATOS_CORREGIDOS`, `CAMBIO_SOLICITADO`, `CAMBIO_APROBADO`, `CAMBIO_RECHAZADO` (solo nombres de campo) |
| Baja (estado, cuentas y **todas** las cancelaciones) | Backend (`inTransaction`) | En la transacción |
| Alta pública de alumno/empresa | Backend | Ninguna (el convenio generado sí registra `GENERAR`) |

`inTransaction` toma una conexión, pone `autocommit = 0` y nivel **READ COMMITTED** para esa transacción, ejecuta la operación y hace un único `COMMIT`; cualquier error lo deshace todo. Los correos se envían siempre **después** del `COMMIT`: nunca se anuncia algo que no se ha guardado.

### 5.2 Requisitos de atomicidad y lo que no es atómico

Atómico (todo o nada):
- Alta pública de alumno (persona, solicitud, dos documentos, cuenta).
- Alta pública de empresa (empresa, domicilios, contactos, solicitud, ofertas, transportes, cuenta, tutor).
- Validar un convenio **y** la solicitud de empresa PENDIENTE.
- Guardar un documento (versión, procedencia, firmas, evento).
- Reducir un cupo y cancelar las reservas elegidas.
- Confirmar una reserva y cancelar las demás pendientes del alumno.
- Cualquier transición de reserva **y** su evento de auditoría: si el evento no se puede escribir, se deshace la transición.
- Baja: estado BAJA, desactivación de cuentas, cancelación de cada reserva y sus eventos. Si una cancelación falla, no queda nada hecho.
- Aprobar una petición de corrección de alumno: aplicar los datos, cerrar la petición y registrar el evento.

**No** atómico:
- **Alta de empresa + convenio**: la solicitud existe aunque la generación falle.
- **Correos**: siempre después del commit, sin reintento.

### 5.3 Bloqueos y concurrencia

| Situación | Mecanismo | Resultado ante la carrera |
| --- | --- | --- |
| Dos reservas por la última plaza | Bloqueo de la oferta en el procedimiento + recuento bloqueante del trigger | Una gana; la otra espera y recibe 400 «No quedan plazas…» |
| Confirmación y reserva nueva del mismo alumno | Bloqueo de la solicitud de alumno (primer paso del orden común) | La segunda espera y ve el resultado de la primera |
| Reducción de cupo y reserva sobre la misma oferta | Bloqueo de la oferta + `trg_dsee_bu_cupo` con recuento bloqueante | Nunca se supera el cupo |
| Dos confirmaciones del mismo alumno | `uq_dual_reservas_confirmada_alumno` | `ER_DUP_ENTRY` → 409 «El alumno ya tiene otra reserva confirmada.» |
| Dos subidas simultáneas del mismo documento | `SELECT padre FOR UPDATE` al inicio de `saveByClave` + `FOR UPDATE` en el procedimiento + `uq_dd_actual` | Se serializan: un documento actual y el otro archivado; si aun así colisionan → 409 `DOCUMENTO_CONCURRENTE` |
| Dos altas públicas del mismo CIF o DNI | `SELECT … FOR UPDATE` (bloqueo de hueco) + índice único | 409 (`EMPRESA_YA_REGISTRADA` / `DUPLICADO`) o interbloqueo → 409 `CONCURRENCIA` |
| Interbloqueo | `inTransaction` repite **toda** la operación con otra conexión (máx. 2 reintentos); fuera de `inTransaction`, `mapSqlError` | Si persiste, 409 `CONCURRENCIA` |
| Espera de bloqueo agotada (50 s) | `mapSqlError` (017) | 409 `CONCURRENCIA`, sin reintento |
| Comprobaciones previas en Node (guardas de subida, `missingStudentValidation`) | Repetidas en procedimiento/trigger cuando es crítico. Las de reservas se hacen dentro de la transacción y bajo bloqueo | — |
| Subida de dos plantillas a la vez | `MAX(version) … FOR UPDATE` + `uq_plantilla_tipo_version` | La segunda puede fallar con `ER_DUP_ENTRY`; `plantillasService.upload` relanza el error → **500** 🔶 |

## 6. Consultas y patrones de acceso importantes

- **Documento actual por padre y tipo** (`documentosWorkflow.latestDocs`): `WHERE (padres…) AND es_actual = 1 ORDER BY id_documento DESC`, y en memoria se queda el primero de cada `padre:clave`. Con `uq_dd_actual` ya no puede haber dos.
- **Plazas** (`getCuposEmpresa`, `getEspecialidades`): `COUNT(CASE …)` por estado con subconsultas al catálogo por nombre, o `fn_reservas_activas`/`fn_cupos_disponibles` por fila.
- **Alumnos disponibles para una empresa** (`getAlumnosDisponibles`): solicitudes VALIDADO de la convocatoria activa, con `sa.id_especialidad` dentro de las especialidades de las ofertas VALIDADO de la empresa, **sin** reserva confirmada (`LEFT JOIN … IS NULL`), con `mi_reserva_id` si la empresa ya tiene una activa.
- **Ofertas/alumnos elegibles** para el personal: misma convocatoria y ciclo, ambos VALIDADO, `fn_cupos_disponibles > 0`, sin reserva activa del par y sin confirmada del alumno (`ACTIVE_PAIR_SQL`). En reasignación no se excluye al alumno confirmado.
- **Motivo/fecha de baja**: subconsultas correlacionadas al último evento `BAJA`.
- **Seguimiento documental**: tres consultas (todas las solicitudes de alumno, de empresa y reservas no canceladas de **todos los años**) + documentos actuales + firmas + plantillas activas; la proyección, filtrado y paginación se hacen en Node ([panel y seguimiento](../logica-de-negocio/panel-y-seguimiento.md)).
