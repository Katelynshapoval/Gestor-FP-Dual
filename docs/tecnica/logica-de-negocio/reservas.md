# Reservas

> Código: [`reservasService.js`](../../../backend/src/services/reservasService.js), [`estadoReglas.js`](../../../backend/src/services/estadoReglas.js) (`tipoContratoCambiable`, `reservaConfirmable`), procedimientos `sp_reservar_alumno`, `sp_cancelar_reserva`, `sp_cancelar_reserva_admin`, `sp_reasignar_reserva`, `sp_confirmar_reserva`, triggers `trg_dr_*`. Frontend: [`ReservaDetalle.jsx`](../../../frontend/src/components/reservas/ReservaDetalle.jsx), [`Reservas.jsx`](../../../frontend/src/pages/Reservas/Reservas.jsx), [`LinkStudents`](../../../frontend/src/pages/LinkStudents/index.js). Pruebas: `phase2.test.js`, `phase3.test.js`, `phase4.test.js` (detalle), `test/db/phase2.db.test.js`.

## 1. Concepto

Una **reserva** une una solicitud de alumno con una **oferta** (`dual_solicitud_empresa_especialidades`) de una solicitud de empresa. Ocupa una plaza mientras está PENDIENTE o CONFIRMADA. Un alumno puede tener **varias reservas PENDIENTE** a la vez (en empresas distintas) pero **solo una CONFIRMADA**; confirmar una cancela las demás pendientes.

Condiciones comunes de elegibilidad (Node `validateReservaTargets` + trigger `trg_dr_bi_reglas`):
- solicitud de alumno y de empresa **VALIDADO**;
- misma convocatoria;
- **ciclo de la solicitud del alumno = ciclo de la oferta**;
- plazas libres y el alumno sin reserva confirmada.

## 2. Reservar

### 2.1 Empresa — `POST /reservas { id_solicitud_alumno, id_solicitud_empresa_especialidad }`

1. La oferta debe ser **de la propia empresa**, de la **convocatoria activa** y de una solicitud **VALIDADO** → si no, 403.
2. `validateReservaTargets(…, requireActive: true)`: 404 si no existe; 400 si no son VALIDADO, convocatoria distinta o ciclo distinto.
3. `CALL sp_reservar_alumno` (transacción y bloqueos propios; ver [integridad § 3.1](../base-de-datos/integridad-y-transacciones.md#31-sp_reservar_alumno)).
4. Evento `RESERVAR` tras el commit; correo al alumno.
5. 201 `{ id_reserva, estado_reserva: 'PENDIENTE' }`.

La empresa elige alumnos de `GET /alumnos/disponibles`: solicitudes VALIDADO de la convocatoria activa, del ciclo de alguna de sus ofertas VALIDADO, **sin reserva confirmada**, con `mi_reserva_id` si ya tiene una activa con ese alumno y sus documentos proyectados para la empresa (la empresa ve el CV, no el Anexo DGA).

### 2.2 Personal — `POST /reservas/admin`

Igual pero **sin exigir convocatoria activa** (puede reservar en convocatorias pasadas si las solicitudes siguen VALIDADO). Se avisa al alumno y a la empresa («El centro ha asignado un alumno…»). Las listas de apoyo son `GET /reservas/ofertas-elegibles?id_solicitud_alumno=` y `GET /reservas/alumnos-elegibles?id_solicitud_empresa_especialidad=` (solo con plazas > 0, sin reserva activa del par y alumno sin confirmada).

### 2.3 Repetir y reactivar

- Reservar un par que ya está **PENDIENTE** devuelve la misma reserva sin cambios en BD, pero el backend **vuelve a registrar el evento y a enviar el correo** ([comportamientos especiales](../comportamientos-especiales/reservas.md#reservar-dos-veces-el-mismo-par)).
- Reservar un par **CANCELADA** reactiva la misma fila: PENDIENTE, sin tipo de contrato, sin tutor, sin motivo, y sus documentos pasan a historial (`es_actual = 0`).

## 3. Cancelar

| Quién | Endpoint | Estados de origen | Procedimiento | Notificación |
| --- | --- | --- | --- | --- |
| Empresa propietaria | `POST /reservas/:id/cancelar {motivo}` | **Solo PENDIENTE** (400 si no; 403 si no es suya) | `sp_cancelar_reserva` | Alumno |
| Personal | `POST /reservas/:id/cancelar-admin {motivo}` | PENDIENTE o CONFIRMADA | `sp_cancelar_reserva_admin` | Alumno y empresa |

En ambos casos: motivo obligatorio; `id_tipo_contrato` pasa a NULL (lo exige el trigger); tutor y documentos se conservan como historial; evento `CANCELAR` tras el commit (con `detalle.administrativa` en el caso del personal). Otros caminos que cancelan: confirmación de otra reserva del alumno, reducción de cupo, baja y reasignación (origen).

## 4. Reasignar — `POST /reservas/:id/reasignar { id_solicitud_empresa_especialidad, motivo }` (personal)

1. Motivo obligatorio; origen existente y no CANCELADA; destino distinto del origen.
2. `validateReservaTargets` del alumno con la oferta destino (sin exigir convocatoria activa).
3. `CALL sp_reasignar_reserva` (atómico): origen → CANCELADA con el motivo; destino → PENDIENTE (fila nueva o reactivada limpia).
4. Eventos `REASIGNAR` (origen, con `id_reserva_destino`) y `RESERVAR` (destino, con `reasignada_desde`); avisos de cancelación (alumno y empresa de origen) y de creación por el centro (alumno y empresa de destino).

Funciona desde **CONFIRMADA**: el alumno pasa a tener una reserva **PENDIENTE** en el destino y pierde la confirmación. Las destinaciones se listan con `GET /reservas/ofertas-elegibles?id_solicitud_alumno=&reasignar_desde=<id>`, que no excluye al alumno confirmado.

## 5. Tipo de contrato — `POST /reservas/:id/tipo-contrato { id_tipo_contrato }` (personal)

Determina la **familia de anexo**: nombre con «beca» → **Anexo III**; cualquier otro (contrato de formación en alternancia, convenio, otro) → **Anexo II**.

Transacción con bloqueo de la reserva y de sus anexos actuales:

| Situación | Resultado |
| --- | --- |
| Reserva inexistente | 404 |
| Tipo inexistente | 400 |
| Reserva CANCELADA o CONFIRMADA | 400 (`RESERVA_CANCELADA` / `RESERVA_CONFIRMADA`) |
| Sin tipo previo, o cambio **dentro de la misma familia** (p. ej. Contrato ↔ Otro) | Permitido siempre |
| Cambio de familia con un anexo de la familia actual **con fichero y no RECHAZADO** (pendiente o validado) | **409 `ANEXO_EXISTENTE`** («…hay que rechazar antes ese documento») |
| Cambio de familia con el anexo actual RECHAZADO | Permitido: ese anexo pasa a historial (`es_actual = 0`, `documentos_retirados`) |
| Mismo id que el guardado | 200 sin cambios |

Se registra el evento `TIPO_CONTRATO` con ids en `estado_anterior/nuevo` y nombres en `detalle` (el nombre más largo no cabe en `VARCHAR(30)`).

## 6. Confirmar — `POST /reservas/:id/confirmar { id_tipo_contrato? }` (personal)

Comprobaciones (`reservaConfirmable` en Node y de nuevo en `sp_confirmar_reserva` bajo bloqueo):

1. Reserva PENDIENTE (400 `NO_PENDIENTE`).
2. Tipo de contrato **guardado** (400 `SIN_TIPO_CONTRATO`). Si se envía un tipo distinto del guardado → 400 `TIPO_DISTINTO` (la confirmación ya no sirve para fijar el tipo).
3. Anexo de la familia **actual y con fichero** (400 `ANEXO_FALTA`).
4. **Todas las firmas** del anexo: EMPRESA, GESTOR y ALUMNO (400 `FIRMAS_PENDIENTES`, con los roles que faltan), salvo exención heredada.
5. Anexo **VALIDADO** (400 `ANEXO_SIN_VALIDAR`).

El **Calendario no es requisito** de confirmación.

Efectos: reserva CONFIRMADA; las demás reservas PENDIENTE del alumno → CANCELADA («Alumno asignado a otra empresa.»). Eventos `CONFIRMAR` y un `CANCELAR` por cada hermana (`detalle.por_confirmacion_de`). Correos: alumno y empresa confirmados; cada empresa que pierde al alumno recibe aviso de cancelación (el alumno no recibe esos avisos). Si otra confirmación del mismo alumno gana la carrera → 409 «El alumno ya tiene otra reserva confirmada.»

## 7. Ficha de reserva — `GET /reservas/:id/detalle`

Acceso: personal, la empresa propietaria o el alumno de la reserva (403 en otro caso). Devuelve:

- `reserva`: estado, tipo y familia de anexo, tutor, alumno, empresa, oferta, convocatoria. El `motivo` solo si CANCELADA y el rol no es ALUMNO.
- `documentos`: anexo de la familia (si hay tipo) y Calendario, proyectados para el rol; en reservas CANCELADA, **solo consulta** (sin acciones).
- `historial` (solo personal): versiones no actuales y documentos heredados de la reserva (p. ej. Anexo H).
- `confirmacion`: `lista`, `motivo` y la lista de requisitos (tipo indicado, anexo subido, firmas, validado), calculados con la **misma regla** que el endpoint de confirmación.
- `acciones` con `permitido` y `motivo`: `cambiar_tipo`, `cambio_familia`, `confirmar`, `cancelar` (con `via`: `cancelar-admin` o `cancelar`), `reasignar`, `asignar_tutor`.

Las acciones solo guían la pantalla: cada endpoint vuelve a aplicar sus reglas.

## 8. Listados

| Endpoint | Rol | Contenido |
| --- | --- | --- |
| `GET /reservas` | Personal | **Todas las reservas de todos los años** (sin filtro en SQL), con alumno, empresa, ciclo, convocatoria, tutor, anexo actual y `documentos_resumen` (estado de anexo y calendario) |
| `GET /reservas/empresa` | EMPRESA | Las de sus solicitudes, todas las convocatorias |
| `GET /reservas/alumno` | ALUMNO | Las de sus solicitudes, **sin motivo** |

## 9. Efectos sobre otros componentes

- Plazas ocupadas y disponibles de la oferta (listados de cupos y elegibles).
- `GET /alumnos/disponibles`: un alumno con reserva confirmada desaparece para todas las empresas.
- Documentos de la reserva (anexo y calendario) y su visibilidad para alumno y empresa.
- Panel: contadores de reservas pendientes por grupo (sin tipo, documentación, firmas, revisar, listas).
